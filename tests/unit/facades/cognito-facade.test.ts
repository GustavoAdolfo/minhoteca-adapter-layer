import {
  AdminConfirmSignUpCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminResetUserPasswordCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminUserGlobalSignOutCommand,
  AttributeType,
  GetUserCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { LogService } from '@gustavoadolfo/minhoteca-core-layer';
import { CognitoFacade } from '../../../layer/nodejs/src/facades/cognito-facade';
import { CognitoFacade as ExportedFacade } from '../../../layer/nodejs/src/facades';
import { createClient, SERVICE_TYPE } from '../../../layer/nodejs/src/factories/aws-client.factory';

jest.mock('../../../layer/nodejs/src/factories/aws-client.factory', () => ({
  SERVICE_TYPE: { COGNITO: 'COGNITO' },
  createClient: jest.fn(),
}));

jest.mock('@gustavoadolfo/minhoteca-core-layer', () => ({
  LogService: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
  })),
}));

const attributes = [
  { Name: 'name', Value: 'Nome atualizado' },
  { Name: 'custom:bibliotecaId', Value: 'biblioteca-123' },
];
const operations = [
  {
    name: 'getUserAttributes',
    invoke: (facade: CognitoFacade) => facade.getUserAttributes('access-token'),
    command: GetUserCommand,
    input: { AccessToken: 'access-token' },
  },
  {
    name: 'adminGetUserAttributes',
    invoke: (facade: CognitoFacade) => facade.adminGetUserAttributes('user-sub'),
    command: AdminGetUserCommand,
    input: { UserPoolId: 'pool-id', Username: 'user-sub' },
  },
  {
    name: 'adminUpdateUserAttributes',
    invoke: (facade: CognitoFacade) => facade.adminUpdateUserAttributes('user-sub', attributes),
    command: AdminUpdateUserAttributesCommand,
    input: { UserPoolId: 'pool-id', Username: 'user-sub', UserAttributes: attributes },
  },
  {
    name: 'adminDisableUser',
    invoke: (facade: CognitoFacade) => facade.adminDisableUser('user-sub'),
    command: AdminDisableUserCommand,
    input: { UserPoolId: 'pool-id', Username: 'user-sub' },
  },
  {
    name: 'adminEnableUser',
    invoke: (facade: CognitoFacade) => facade.adminEnableUser('user-sub'),
    command: AdminEnableUserCommand,
    input: { UserPoolId: 'pool-id', Username: 'user-sub' },
  },
  {
    name: 'adminSetUserPassword',
    invoke: (facade: CognitoFacade) => facade.adminSetUserPassword('user-sub', 'Secret123!'),
    command: AdminSetUserPasswordCommand,
    input: {
      UserPoolId: 'pool-id',
      Username: 'user-sub',
      Password: 'Secret123!',
      Permanent: false,
    },
  },
  {
    name: 'adminResetUserPassword',
    invoke: (facade: CognitoFacade) => facade.adminResetUserPassword('user-sub'),
    command: AdminResetUserPasswordCommand,
    input: { UserPoolId: 'pool-id', Username: 'user-sub' },
  },
  {
    name: 'adminConfirmSignUp',
    invoke: (facade: CognitoFacade) => facade.adminConfirmSignUp('user-sub'),
    command: AdminConfirmSignUpCommand,
    input: { UserPoolId: 'pool-id', Username: 'user-sub' },
  },
  {
    name: 'adminUserGlobalSignOut',
    invoke: (facade: CognitoFacade) => facade.adminUserGlobalSignOut('user-sub'),
    command: AdminUserGlobalSignOutCommand,
    input: { UserPoolId: 'pool-id', Username: 'user-sub' },
  },
  {
    name: 'listUsersPage',
    invoke: (facade: CognitoFacade) => facade.listUsersPage(),
    command: ListUsersCommand,
    input: { UserPoolId: 'pool-id' },
  },
];

describe('CognitoFacade', () => {
  let facade: CognitoFacade;
  let mockSend: jest.Mock;
  const originalPoolId = process.env.USER_POOL_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.USER_POOL_ID = 'pool-id';
    mockSend = jest.fn();
    (createClient as jest.Mock).mockReturnValue({ send: mockSend });
    facade = new CognitoFacade('execucao-cognito');
  });

  afterEach(() => {
    if (originalPoolId === undefined) delete process.env.USER_POOL_ID;
    else process.env.USER_POOL_ID = originalPoolId;
  });

  it('initializes the shared Cognito client and exports the facade', () => {
    expect(createClient).toHaveBeenCalledWith(SERVICE_TYPE.COGNITO);
    expect(facade.client.send).toBe(mockSend);
    expect(ExportedFacade).toBe(CognitoFacade);
    expect(LogService).toHaveBeenCalledWith('CognitoFacade');
  });

  it('logs and rejects client initialization failures', () => {
    (createClient as jest.Mock).mockReturnValue(null);
    expect(() => new CognitoFacade('failed')).toThrow('inicializar o cliente Cognito');
    expect((LogService as jest.Mock).mock.results[1].value.error).toHaveBeenCalled();
  });

  it.each(operations)('$name sends the expected SDK command and returns its output', async (op) => {
    const output = { $metadata: {}, Username: 'user-sub' };
    mockSend.mockResolvedValue(output);
    await expect(op.invoke(facade)).resolves.toBe(output);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0]).toBeInstanceOf(op.command);
    expect(mockSend.mock.calls[0][0].input).toEqual(op.input);
    expect((LogService as jest.Mock).mock.results[0].value.info).toHaveBeenLastCalledWith(
      `Operação Cognito ${op.name} concluída com sucesso`,
      { idExecucao: 'execucao-cognito' }
    );
  });

  it.each(operations)('$name logs and propagates SDK errors', async (op) => {
    const error = new Error('Cognito indisponível');
    mockSend.mockRejectedValue(error);
    await expect(op.invoke(facade)).rejects.toBe(error);
    expect((LogService as jest.Mock).mock.results[0].value.error).toHaveBeenCalledWith(
      `Erro na operação Cognito ${op.name}`,
      { label: op.name, idExecucao: 'execucao-cognito', error }
    );
  });

  it.each(operations.filter((op) => op.name !== 'getUserAttributes'))(
    '$name rejects a missing pool before sending a command',
    async (op) => {
      delete process.env.USER_POOL_ID;
      await expect(op.invoke(facade)).rejects.toThrow('USER_POOL_ID');
      expect(mockSend).not.toHaveBeenCalled();
      expect((LogService as jest.Mock).mock.results[0].value.error).toHaveBeenCalled();
    }
  );

  it('supports the legacy attributes signature without changing the client region', async () => {
    mockSend.mockResolvedValue({});
    await facade.adminUpdateUserAttributes('user-sub', 'us-east-1', attributes);
    expect(mockSend.mock.calls[0][0].input.UserAttributes).toEqual(attributes);
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it('allows an empty attribute value for removal', async () => {
    mockSend.mockResolvedValue({});
    await facade.adminUpdateUserAttributes('user-sub', [{ Name: 'nickname', Value: '' }]);
    expect(mockSend.mock.calls[0][0].input.UserAttributes).toEqual([
      { Name: 'nickname', Value: '' },
    ]);
  });

  it.each([
    { invalidAttributes: [] as AttributeType[] },
    { invalidAttributes: [{ Value: 'value' }] as unknown as AttributeType[] },
    { invalidAttributes: [{ Name: 'name' }] as unknown as AttributeType[] },
  ])('logs and rejects invalid attributes: $invalidAttributes', async ({ invalidAttributes }) => {
    await expect(facade.adminUpdateUserAttributes('user-sub', invalidAttributes)).rejects.toThrow(
      'UserAttributes'
    );
    expect(mockSend).not.toHaveBeenCalled();
    expect((LogService as jest.Mock).mock.results[0].value.error).toHaveBeenCalled();
  });

  it('can set a permanent password without logging the password', async () => {
    mockSend.mockResolvedValue({});
    await facade.adminSetUserPassword('user-sub', 'Secret123!', true);
    expect(mockSend.mock.calls[0][0].input.Permanent).toBe(true);
    const logs = (LogService as jest.Mock).mock.results[0].value;
    expect(JSON.stringify(logs.info.mock.calls)).not.toContain('Secret123!');
  });

  it('does not log access tokens or returned user attributes', async () => {
    mockSend.mockResolvedValue({
      UserAttributes: [{ Name: 'email', Value: 'private@example.com' }],
    });
    await facade.getUserAttributes('private-token');
    const logs = (LogService as jest.Mock).mock.results[0].value;
    expect(JSON.stringify(logs.info.mock.calls)).not.toContain('private-token');
    expect(JSON.stringify(logs.info.mock.calls)).not.toContain('private@example.com');
  });

  it.each([
    (cognito: CognitoFacade) => cognito.adminDisableUser(' '),
    (cognito: CognitoFacade) => cognito.getUserAttributes(''),
    (cognito: CognitoFacade) => cognito.adminSetUserPassword('user-sub', ''),
  ])('logs and rejects empty required inputs', async (invoke) => {
    await expect(invoke(facade)).rejects.toThrow('obrigatório');
    expect(mockSend).not.toHaveBeenCalled();
    expect((LogService as jest.Mock).mock.results[0].value.error).toHaveBeenCalled();
  });

  it('returns all pages, attributes and disabled users without an implicit filter', async () => {
    const first = {
      Username: 'first',
      Enabled: false,
      Attributes: [{ Name: 'name', Value: 'First' }],
    };
    const second = { Username: 'second', Enabled: true };
    mockSend
      .mockResolvedValueOnce({ Users: [first], PaginationToken: 'page-2' })
      .mockResolvedValueOnce({ PaginationToken: 'page-3' })
      .mockResolvedValueOnce({ Users: [second] });
    await expect(facade.listUsers()).resolves.toEqual([first, second]);
    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(mockSend.mock.calls.map(([command]) => command.input)).toEqual([
      { UserPoolId: 'pool-id', PaginationToken: undefined },
      { UserPoolId: 'pool-id', PaginationToken: 'page-2' },
      { UserPoolId: 'pool-id', PaginationToken: 'page-3' },
    ]);
  });

  it('preserves list options across pages, including an initial token', async () => {
    const options = {
      Filter: 'status = "Enabled"',
      AttributesToGet: ['sub'],
      Limit: 20,
      PaginationToken: 'start',
    };
    mockSend
      .mockResolvedValueOnce({ Users: [], PaginationToken: 'next' })
      .mockResolvedValueOnce({ Users: [] });
    await facade.listUsers(options);
    expect(mockSend.mock.calls[0][0].input).toEqual({ ...options, UserPoolId: 'pool-id' });
    expect(mockSend.mock.calls[1][0].input).toEqual({
      ...options,
      UserPoolId: 'pool-id',
      PaginationToken: 'next',
    });
    expect(options.PaginationToken).toBe('start');
  });

  it('returns the page token unchanged without fetching another page', async () => {
    const options = { Limit: 20, Filter: 'status = "Enabled"', PaginationToken: 'start' };
    const output = { Users: [], PaginationToken: 'next' };
    mockSend.mockResolvedValue(output);
    await expect(facade.listUsersPage(options)).resolves.toBe(output);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].input).toEqual({ ...options, UserPoolId: 'pool-id' });
  });

  it('returns an empty array when no users are returned', async () => {
    mockSend.mockResolvedValue({});
    await expect(facade.listUsers()).resolves.toEqual([]);
  });

  it('rejects a pagination cycle rather than looping or returning partial results', async () => {
    mockSend
      .mockResolvedValueOnce({ Users: [], PaginationToken: 'next' })
      .mockResolvedValueOnce({ Users: [], PaginationToken: 'start' });
    await expect(facade.listUsers({ PaginationToken: 'start' })).rejects.toThrow(
      'PaginationToken repetido'
    );
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect((LogService as jest.Mock).mock.results[0].value.error).toHaveBeenCalled();
  });

  it('logs and rejects a missing pool for full listing', async () => {
    process.env.USER_POOL_ID = ' ';
    await expect(facade.listUsers()).rejects.toThrow('USER_POOL_ID');
    expect(mockSend).not.toHaveBeenCalled();
    expect((LogService as jest.Mock).mock.results[0].value.error).toHaveBeenCalled();
  });

  it('propagates subsequent page failures without returning partial results', async () => {
    const error = new Error('Falha na segunda página');
    mockSend
      .mockResolvedValueOnce({ Users: [{ Username: 'first' }], PaginationToken: 'next' })
      .mockRejectedValueOnce(error);
    await expect(facade.listUsers()).rejects.toBe(error);
    expect((LogService as jest.Mock).mock.results[0].value.error).toHaveBeenCalledWith(
      'Erro na operação Cognito listUsers',
      { label: 'listUsers', idExecucao: 'execucao-cognito', error }
    );
  });
});
