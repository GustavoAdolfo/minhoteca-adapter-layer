import {
  AttributeValue,
  DynamoDBClient,
  QueryCommand,
  QueryInput,
  QueryOutput,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { SERVICE_TYPE, createClient } from '../factories/aws-client.factory';
import { KeyValueAttr, RepositoryInterface, ResultType } from '../interfaces';

export class DynamoDBRepository implements RepositoryInterface {
  private client: DynamoDBDocumentClient;

  constructor() {
    this.client = DynamoDBDocumentClient.from(
      createClient(SERVICE_TYPE.DYNAMODB) as DynamoDBClient,
      {
        marshallOptions: {
          // Remove valores undefined (evita erro do DynamoDB)
          removeUndefinedValues: true,
          // Converte instâncias de classes em maps
          convertClassInstanceToMap: true,
          // Converte objetos vazios em maps vazios (default: false)
          convertEmptyValues: false,
          // Converte top-level containers (útil para Sets, Maps complexos)
          convertTopLevelContainer: false,
        },
        unmarshallOptions: {
          // Converte números armazenados como strings de volta para Number
          wrapNumbers: false,
        },
      }
    );
  }

  async updateByMinhotecaId(tableName: string, data: unknown, id: string): Promise<ResultType> {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Parâmetro data deve ser um objeto com campos a serem atualizados');
    }

    const updateData = data as Record<string, unknown>;
    const keys = Object.keys(updateData).filter((key) => key !== 'id');

    if (keys.length === 0) {
      return {
        data: [],
        currentPage: 1,
        totalPages: 1,
        totalDocuments: 0,
        hasNextPage: false,
        hasPrevPage: false,
        limit: 0,
      };
    }

    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, unknown> = {};
    const setExpressions: string[] = [];

    keys.forEach((key, index) => {
      const attrName = `#attr${index}`;
      const attrValue = `:val${index}`;

      expressionAttributeNames[attrName] = key;
      expressionAttributeValues[attrValue] = updateData[key];
      setExpressions.push(`${attrName} = ${attrValue}`);
    });

    const command = new UpdateCommand({
      TableName: tableName,
      Key: { id },
      UpdateExpression: `SET ${setExpressions.join(', ')}`,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    });

    try {
      const result = await this.client.send(command);
      return {
        data: result.Attributes ? [result.Attributes] : [],
        currentPage: 1,
        totalPages: 1,
        totalDocuments: result.Attributes ? 1 : 0,
        hasNextPage: false,
        hasPrevPage: false,
        limit: result.Attributes ? 1 : 0,
      };
    } catch (error: unknown) {
      throw new Error(`Erro ao atualizar item em ${tableName}: ${String(error)}`);
    }
  }

  async deleteByMinhotecaId(tableName: string, id: string): Promise<ResultType> {
    const command = new DeleteCommand({
      TableName: tableName,
      Key: { id },
      ReturnValues: 'ALL_OLD',
    });

    try {
      const result = await this.client.send(command);

      if (!result.Attributes) {
        return {
          data: [],
          currentPage: 1,
          totalPages: 1,
          totalDocuments: 0,
          hasNextPage: false,
          hasPrevPage: false,
          limit: 0,
        };
      }

      return {
        data: [result.Attributes],
        currentPage: 1,
        totalPages: 1,
        totalDocuments: 1,
        hasNextPage: false,
        hasPrevPage: false,
        limit: 1,
      };
    } catch (error: unknown) {
      throw new Error(`Erro ao remover item por ID em ${tableName}: ${String(error)}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  findByMinhotecaId(collectionName: string, id: string): Promise<ResultType> {
    return this.queryData(collectionName, [
      {
        attribute: {
          AttributeName: 'id',
          AttributeType: 'S',
        },
        attributeValue: id,
        partitionKey: true,
        sortKey: false,
      },
    ]);
  }

  saveData = async (tableName: string, itemData: unknown): Promise<ResultType> => {
    const command = new PutCommand({
      TableName: tableName,
      Item: itemData as Record<string, unknown>,
    });
    const result = await this.client.send(command);
    return {
      data: [result],
      currentPage: 1,
      totalPages: 1,
      totalDocuments: 1,
      hasNextPage: false,
      hasPrevPage: false,
      limit: 1,
    };
  };

  getData = async <T>(
    tableName: string,
    hashKey: { name: string; type: string; value: string },
    sortKey?: { name: string; type: string; value: string } | undefined
  ): Promise<ResultType> => {
    const attributes: unknown[] = [
      {
        attributeName: hashKey.name,
        attributeType: hashKey.type.toUpperCase(),
        attributeValue: hashKey.value,
        partitionKey: true,
        sortKey: false,
      },
    ];

    if (sortKey) {
      attributes.push({
        attributeName: sortKey.name,
        attributeType: sortKey.type.toUpperCase(),
        attributeValue: sortKey.value,
        partitionKey: false,
        sortKey: true,
      });
    }

    const expressionAttributes: Record<string, AttributeValue> = {};
    const attributesNames: Record<string, string> = {};
    const keyConditions: string[] = [];

    attributes.forEach((attrib: any) => {
      const { attributeName, attributeType, attributeValue } = attrib;

      expressionAttributes[`:${attributeName}`] = {
        [attributeType]: attributeValue,
      } as unknown as AttributeValue;

      const chave = `#${attributeName}`;
      attributesNames[chave] = attributeName;
      keyConditions.push(`${chave} = :${attributeName}`);
    });

    const queryParameters: QueryInput = {
      ExpressionAttributeNames: attributesNames,
      ExpressionAttributeValues: expressionAttributes,
      KeyConditionExpression: keyConditions.join(' and '),
      TableName: tableName,
    };

    const cmd = new QueryCommand(queryParameters);

    try {
      const content: QueryOutput = await this.client.send(cmd);
      const result = (content.Items ?? []).map((item) => unmarshall(item));
      return {
        data: result as T[],
        currentPage: 1,
        totalPages: 1,
        totalDocuments: result.length,
        hasNextPage: false,
        hasPrevPage: false,
        limit: result.length,
      };
    } catch (error: unknown) {
      const resultError = new Error(`Erro ao consultar tabela ${tableName}`);
      resultError.stack = JSON.stringify(error);
      throw resultError;
    }
  };

  queryData = async <T>(tableName: string, params: KeyValueAttr[]): Promise<ResultType> => {
    const invalidParams = params.some(
      (param: KeyValueAttr) => !param.attribute.AttributeName || !param.attribute.AttributeType
    );
    if (invalidParams) {
      throw new Error('Parâmetros inválidos para consulta DynamoDB');
    }

    // Se houver partition key, usar getData (que faz Query)
    const pk = params.find((p) => p.partitionKey);
    if (pk) {
      const sk = params.find((p) => p.sortKey);
      const result = await this.getData<T>(
        tableName,
        {
          name: pk.attribute.AttributeName ?? '',
          type: pk.attribute.AttributeType ?? 'S',
          value: pk.attributeValue,
        },
        sk
          ? {
              name: sk.attribute.AttributeName ?? '',
              type: sk.attribute.AttributeType ?? 'S',
              value: sk.attributeValue,
            }
          : undefined
      );
      return result;
    }

    // Caso contrário, fazer Scan com filtros
    const expressionAttributes: Record<string, AttributeValue> = {};
    const attributesNames: Record<string, string> = {};
    let expressionFilters = '';

    params?.forEach((attrib: KeyValueAttr, i: number, attributes) => {
      expressionAttributes[`:${attrib.attribute.AttributeName}`] = {
        [String(attrib.attribute.AttributeType)]: attrib.attributeValue,
      } as unknown as AttributeValue;

      const chave = `#${attrib.attribute.AttributeName}`;
      attributesNames[`${chave}`] = `${attrib.attribute.AttributeName}`;

      expressionFilters += `${chave} = :${attrib.attribute.AttributeName}`;
      if (i < attributes.length - 1) {
        expressionFilters += ' and ';
      }
    });

    const scanParameters: {
      TableName: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: Record<string, AttributeValue>;
      FilterExpression?: string;
    } = {
      TableName: tableName,
    };

    if (expressionFilters.length > 0) {
      scanParameters.ExpressionAttributeNames = attributesNames;
      scanParameters.ExpressionAttributeValues = expressionAttributes;
      scanParameters.FilterExpression = expressionFilters;
    }

    const cmd = new ScanCommand(scanParameters);
    try {
      const content = await this.client.send(cmd);
      const result = (content.Items ?? []).map((item) => unmarshall(item));
      return {
        data: result,
        currentPage: 1,
        totalPages: 1,
        totalDocuments: result.length,
        hasNextPage: false,
        hasPrevPage: false,
        limit: result.length,
      };
    } catch (error: unknown) {
      const resultError = new Error(`Erro ao consultar tabela ${tableName}`);
      resultError.stack = JSON.stringify(error);
      throw resultError;
    }
  };

  removeData = async (
    tableName: string,
    attributes: KeyValueAttr[],
    partKeyName?: string,
    sortKeyName?: string
  ): Promise<ResultType> => {
    try {
      // Validar parâmetros
      const invalidParams = attributes.some(
        (param: KeyValueAttr) => !param.attribute.AttributeName || !param.attribute.AttributeType
      );
      if (invalidParams) {
        throw new Error('Parâmetros inválidos para remover items de DynamoDB');
      }

      // Consultar itens que serão removidos
      const items = await this.queryData<unknown>(tableName, attributes);

      if (items.data.length === 0) {
        return {
          data: {
            success: true,
            message: `Nenhum item encontrado em ${tableName} com os filtros informados`,
          },
          currentPage: 1,
          totalPages: 1,
          totalDocuments: 0,
          hasNextPage: false,
          hasPrevPage: false,
          limit: 0,
        };
      }

      // Identificar partition key (primeira prioridade: marcada como partitionKey, segunda: parâmetro fornecido)
      const partitionKeyAttr = attributes.find((attr) => attr.partitionKey);
      const partitionKeyName = partitionKeyAttr?.attribute.AttributeName ?? partKeyName;

      if (!partitionKeyName) {
        throw new Error('Partition key é obrigatória para remover items');
      }

      let deletedCount = 0;

      // Remover cada item encontrado
      for (const item of items.data) {
        // Construir chave com partition key - valores nativos JS (sem marshall)
        const deleteKey: Record<string, unknown> = {
          [partitionKeyName]: item[partitionKeyName],
        };

        // Identificar sort key: primeiro marcada nos attributes, depois parâmetro fornecido
        const sortKeyAttr = attributes.find((attr) => attr.sortKey);
        const finalSortKeyName = sortKeyAttr?.attribute.AttributeName ?? sortKeyName;

        if (finalSortKeyName && item[finalSortKeyName] !== undefined) {
          deleteKey[finalSortKeyName] = item[finalSortKeyName];
        }

        await this.client.send(
          new DeleteCommand({
            TableName: tableName,
            Key: deleteKey as Record<string, string | number>,
          })
        );
        deletedCount++;
      }

      return {
        data: { success: true, message: `${deletedCount} item(ns) removido(s) de ${tableName}` },
        currentPage: 1,
        totalPages: 1,
        totalDocuments: deletedCount,
        hasNextPage: false,
        hasPrevPage: false,
        limit: deletedCount,
      };
    } catch (error) {
      throw new Error(`Erro ao remover item de ${tableName}: ${String(error)}`);
    }
  };

  getAll = async <T>(tableName: string): Promise<ResultType> => {
    const scanParameters: {
      TableName: string;
    } = {
      TableName: tableName,
    };

    const cmd = new ScanCommand(scanParameters);
    try {
      const content = await this.client.send(cmd);
      const result = (content.Items ?? []).map((item) => unmarshall(item));
      return {
        data: result as T[],
        currentPage: 1,
        totalPages: 1,
        totalDocuments: result.length,
        hasNextPage: false,
        hasPrevPage: false,
        limit: result.length,
      };
    } catch (error: unknown) {
      const resultError = new Error(`Erro ao consultar tabela ${tableName}`);
      resultError.stack = JSON.stringify(error);
      throw resultError;
    }
  };
}
