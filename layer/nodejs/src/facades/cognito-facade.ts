import {
  CognitoIdentityProviderClient,
  AdminDisableUserCommand,
  AdminDisableUserCommandOutput,
  AdminEnableUserCommand,
  AdminEnableUserCommandOutput,
  AdminSetUserPasswordCommand,
  AdminSetUserPasswordCommandOutput,
  AdminResetUserPasswordCommand,
  AdminResetUserPasswordCommandOutput,
  AdminConfirmSignUpCommand,
  AdminConfirmSignUpCommandOutput,
  AdminUserGlobalSignOutCommand,
  AdminUserGlobalSignOutCommandOutput,
  AdminUpdateUserAttributesCommand,
  AdminGetUserCommand,
  ListUsersCommand,
  GetUserCommand,
  AttributeType,
  ListUsersCommandInput,
  ListUsersCommandOutput,
  UserType,
  AdminGetUserCommandOutput,
  GetUserCommandOutput,
  AdminUpdateUserAttributesCommandOutput,
} from '@aws-sdk/client-cognito-identity-provider';
import { SERVICE_TYPE, createClient } from '../factories/aws-client.factory';
import { LogService } from '@gustavoadolfo/minhoteca-core-layer';

export type CognitoListUsersOptions = Omit<ListUsersCommandInput, 'UserPoolId'>;

export class CognitoFacade {
  client: CognitoIdentityProviderClient;
  private logService = new LogService('CognitoFacade');

  constructor(private idExecucao: string) {
    const client = createClient(SERVICE_TYPE.COGNITO);
    if (!client) {
      const error = new Error('Não foi possível inicializar o cliente Cognito');
      this.logService.error(error.message, { idExecucao: this.idExecucao, error });
      throw error;
    }
    this.client = client as CognitoIdentityProviderClient;
    this.logService.info('✅ Cliente Cognito configurado e inicializado');
  }

  async getUserAttributes(token: string): Promise<GetUserCommandOutput> {
    return this.execute('getUserAttributes', () =>
      this.client.send(new GetUserCommand({ AccessToken: this.requireValue(token, 'AccessToken') }))
    );
  }

  adminGetUserAttributes = async (sub: string): Promise<AdminGetUserCommandOutput> => {
    return this.execute('adminGetUserAttributes', () =>
      this.client.send(new AdminGetUserCommand(this.userInput(sub)))
    );
  };

  async adminUpdateUserAttributes(
    sub: string,
    attributes: AttributeType[]
  ): Promise<AdminUpdateUserAttributesCommandOutput>;
  /** @deprecated A região é configurada por AWS_REGION na fábrica de clientes. */
  async adminUpdateUserAttributes(
    sub: string,
    region: string,
    attributes: AttributeType[]
  ): Promise<AdminUpdateUserAttributesCommandOutput>;
  async adminUpdateUserAttributes(
    sub: string,
    attributesOrRegion: AttributeType[] | string,
    legacyAttributes?: AttributeType[]
  ): Promise<AdminUpdateUserAttributesCommandOutput> {
    return this.execute('adminUpdateUserAttributes', () => {
      const attributes =
        typeof attributesOrRegion === 'string' ? legacyAttributes : attributesOrRegion;
      if (!attributes?.length) {
        throw new Error('UserAttributes deve conter pelo menos um atributo');
      }
      for (const attribute of attributes) {
        this.requireValue(attribute.Name, 'UserAttributes.Name');
        if (typeof attribute.Value !== 'string') {
          throw new Error('UserAttributes.Value deve ser uma string');
        }
      }
      return this.client.send(
        new AdminUpdateUserAttributesCommand({
          ...this.userInput(sub),
          UserAttributes: attributes,
        })
      );
    });
  }

  async adminDisableUser(sub: string): Promise<AdminDisableUserCommandOutput> {
    return this.execute('adminDisableUser', () =>
      this.client.send(new AdminDisableUserCommand(this.userInput(sub)))
    );
  }

  async adminEnableUser(sub: string): Promise<AdminEnableUserCommandOutput> {
    return this.execute('adminEnableUser', () =>
      this.client.send(new AdminEnableUserCommand(this.userInput(sub)))
    );
  }

  async adminSetUserPassword(
    sub: string,
    password: string,
    permanent = false
  ): Promise<AdminSetUserPasswordCommandOutput> {
    return this.execute('adminSetUserPassword', () =>
      this.client.send(
        new AdminSetUserPasswordCommand({
          ...this.userInput(sub),
          Password: this.requireValue(password, 'Password'),
          Permanent: permanent,
        })
      )
    );
  }

  async adminResetUserPassword(sub: string): Promise<AdminResetUserPasswordCommandOutput> {
    return this.execute('adminResetUserPassword', () =>
      this.client.send(new AdminResetUserPasswordCommand(this.userInput(sub)))
    );
  }

  async adminConfirmSignUp(sub: string): Promise<AdminConfirmSignUpCommandOutput> {
    return this.execute('adminConfirmSignUp', () =>
      this.client.send(new AdminConfirmSignUpCommand(this.userInput(sub)))
    );
  }

  async adminUserGlobalSignOut(sub: string): Promise<AdminUserGlobalSignOutCommandOutput> {
    return this.execute('adminUserGlobalSignOut', () =>
      this.client.send(new AdminUserGlobalSignOutCommand(this.userInput(sub)))
    );
  }

  async listUsersPage(options: CognitoListUsersOptions = {}): Promise<ListUsersCommandOutput> {
    return this.execute('listUsersPage', () =>
      this.client.send(
        new ListUsersCommand({
          ...options,
          UserPoolId: this.requireValue(process.env.USER_POOL_ID, 'USER_POOL_ID'),
        })
      )
    );
  }

  async listUsers(options: CognitoListUsersOptions = {}): Promise<UserType[]> {
    return this.execute('listUsers', async () => {
      const users: UserType[] = [];
      const userPoolId = this.requireValue(process.env.USER_POOL_ID, 'USER_POOL_ID');
      let paginationToken = options.PaginationToken;
      const seenTokens = new Set<string>();
      if (paginationToken) seenTokens.add(paginationToken);

      do {
        const response = await this.client.send(
          new ListUsersCommand({
            ...options,
            UserPoolId: userPoolId,
            PaginationToken: paginationToken,
          })
        );
        users.push(...(response.Users ?? []));
        paginationToken = response.PaginationToken;
        if (paginationToken) {
          if (seenTokens.has(paginationToken)) {
            throw new Error('Cognito retornou um PaginationToken repetido');
          }
          seenTokens.add(paginationToken);
        }
      } while (paginationToken);

      return users;
    });
  }

  private userInput(sub: string): { UserPoolId: string; Username: string } {
    return {
      UserPoolId: this.requireValue(process.env.USER_POOL_ID, 'USER_POOL_ID'),
      Username: this.requireValue(sub, 'Username'),
    };
  }

  private requireValue(value: string | undefined, name: string): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${name} é obrigatório`);
    }
    return value;
  }

  private async execute<T>(label: string, operation: () => Promise<T>): Promise<T> {
    try {
      const response = await operation();
      this.logService.info(`Operação Cognito ${label} concluída com sucesso`, {
        idExecucao: this.idExecucao,
      });
      return response;
    } catch (error) {
      this.logService.error(`Erro na operação Cognito ${label}`, {
        label,
        idExecucao: this.idExecucao,
        error,
      });
      throw error;
    }
  }
}
