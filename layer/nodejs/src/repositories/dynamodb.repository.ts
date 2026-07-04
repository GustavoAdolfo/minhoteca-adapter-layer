import {
  AttributeValue,
  BatchGetItemCommand,
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
import { LogService } from '@gustavoadolfo/minhoteca-core-layer';

export class DynamoDBRepository implements RepositoryInterface {
  private client: DynamoDBDocumentClient;
  private logService = new LogService('DynamoDBRepository');

  #normalizeSortValue(value: unknown): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  constructor() {
    this.client = DynamoDBDocumentClient.from(
      createClient(SERVICE_TYPE.DYNAMODB) as DynamoDBClient,
      {
        marshallOptions: {
          removeUndefinedValues: true,
          convertClassInstanceToMap: true,
          convertEmptyValues: false,
          convertTopLevelContainer: false,
        },
        unmarshallOptions: {
          wrapNumbers: false,
        },
      }
    );
    this.logService.info('✅ Cliente DynamoDB configurado e inicializado');
  }

  async updateByMinhotecaId(
    tableName: string,
    data: Record<string, unknown>,
    id: string
  ): Promise<ResultType> {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      this.logService.error('‼️ Parâmetro data deve ser um objeto com campos a serem atualizados.');
      throw new Error('Parâmetro data deve ser um objeto com campos a serem atualizados.');
    }

    const updateData = data;
    const keys = Object.keys(updateData).filter((key) => key !== 'id');

    if (keys.length === 0) {
      this.logService.info('⁉️ Nenhum campo para atualização fornecido.');
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
      this.logService.info(`✅ Dados atualizados com sucesso em ${tableName}!`, {
        result,
        updateData,
      });
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
      this.logService.error(
        `❌ Erro ao atualizar item em ${tableName}: ${String(error)}`,
        {
          updateData,
        },
        error as Error
      );
      throw new Error(`Erro ao atualizar item em ${tableName}: ${String(error)}`);
    }
  }

  async deleteByMinhotecaId(tableName: string, id: string): Promise<ResultType> {
    this.logService.info(`🗑️ Iniciando remoção de item por ID em ${tableName}...`, { id });
    const command = new DeleteCommand({
      TableName: tableName,
      Key: { id },
      ReturnValues: 'ALL_OLD',
    });

    try {
      const result = await this.client.send(command);

      if (!result.Attributes) {
        this.logService.info(`⚠️ Nenhum item encontrado para o ID ${id} em ${tableName}.`);
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

      this.logService.info(`✅ Item com ID ${id} removido com sucesso de ${tableName}!`, {
        result,
      });
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
      this.logService.error(
        `❌ Erro ao remover item por ID em ${tableName}...`,
        { id },
        error as Error
      );
      throw new Error(`Erro ao remover item por ID em ${tableName}: ${String(error)}`);
    }
  }

  findByMinhotecaId(collectionName: string, id: string): Promise<ResultType> {
    this.logService.info(`🔍 Buscando item pelo ID ${id} na tabela ${collectionName}...`);
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

  saveData = async (tableName: string, itemData: Record<string, unknown>): Promise<ResultType> => {
    this.logService.info(`💾 Salvando dados na tabela ${tableName}...`);
    const command = new PutCommand({
      TableName: tableName,
      Item: itemData,
    });
    try {
      const result = await this.client.send(command);
      this.logService.info(`✅ Dados salvos com sucesso em ${tableName}!`);
      return {
        data: [result],
        currentPage: 1,
        totalPages: 1,
        totalDocuments: 1,
        hasNextPage: false,
        hasPrevPage: false,
        limit: 1,
      };
    } catch (error: unknown) {
      this.logService.error(
        `❌ Erro ao salvar dados na tabela ${tableName}`,
        { itemData },
        error as Error
      );
      throw error;
    }
  };

  getData = async (
    tableName: string,
    hashKey: { name: string; type: string; value: string },
    sortKey?: { name: string; type: string; value: string } | undefined
  ): Promise<ResultType> => {
    this.logService.info(`📡 Consultando dados (Query) na tabela ${tableName}...`, {
      hashKey,
      sortKey,
    });
    const attributes: Array<{
      attributeName: string;
      attributeType: string;
      attributeValue: string;
      partitionKey: boolean;
      sortKey: boolean;
    }> = [
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

    attributes.forEach((attrib) => {
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
      this.logService.info(
        `✅ Consulta (Query) realizada com sucesso em ${tableName}. Foram retornados ${result.length} item(ns).`
      );
      return {
        data: result as [],
        currentPage: 1,
        totalPages: 1,
        totalDocuments: result.length,
        hasNextPage: false,
        hasPrevPage: false,
        limit: result.length,
      };
    } catch (error: unknown) {
      this.logService.error(
        `❌ Erro ao consultar tabela (Query) ${tableName}`,
        { hashKey, sortKey },
        error as Error
      );
      const resultError = new Error(`Erro ao consultar tabela ${tableName}`);
      resultError.stack = JSON.stringify(error);
      throw resultError;
    }
  };

  queryData = async (tableName: string, params: KeyValueAttr[]): Promise<ResultType> => {
    this.logService.info(`📡 Iniciando consulta (queryData) na tabela ${tableName}...`);
    const invalidParams = params.some(
      (param: KeyValueAttr) => !param.attribute.AttributeName || !param.attribute.AttributeType
    );
    if (invalidParams) {
      this.logService.error('‼️ Parâmetros inválidos para consulta DynamoDB', { params });
      throw new Error('Parâmetros inválidos para consulta DynamoDB');
    }

    // Se houver partition key, usar getData (que faz Query)
    const pk = params.find((p) => p.partitionKey);
    if (pk) {
      this.logService.info('🔄 Chave de partição identificada, redirecionando para getData...');
      const sk = params.find((p) => p.sortKey);
      const result = await this.getData(
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

    this.logService.info(`📡 Executando Scan na tabela ${tableName} com filtros...`, {
      scanParameters,
    });
    const cmd = new ScanCommand(scanParameters);
    try {
      const content = await this.client.send(cmd);
      const result = (content.Items ?? []).map((item) => unmarshall(item));
      this.logService.info(
        `✅ Scan realizado com sucesso em ${tableName}. Foram retornados ${result.length} item(ns).`
      );
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
      this.logService.error(
        `❌ Erro ao executar Scan na tabela ${tableName}`,
        { params },
        error as Error
      );
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
      this.logService.info(`🗑️ Iniciando remoção múltipla de itens na tabela ${tableName}...`, {
        attributes,
      });
      // Validar parâmetros
      const invalidParams = attributes.some(
        (param: KeyValueAttr) => !param.attribute.AttributeName || !param.attribute.AttributeType
      );
      if (invalidParams) {
        this.logService.error('‼️ Parâmetros inválidos para remover items de DynamoDB', {
          attributes,
        });
        throw new Error('Parâmetros inválidos para remover items de DynamoDB');
      }

      // Consultar itens que serão removidos
      const items = await this.queryData(tableName, attributes);

      if (items.data.length === 0) {
        this.logService.info(
          `⚠️ Nenhum item encontrado em ${tableName} com os filtros informados para remoção.`
        );
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
        this.logService.error('‼️ Partition key é obrigatória para remover items', { partKeyName });
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

      this.logService.info(`✅ ${deletedCount} item(ns) removido(s) com sucesso de ${tableName}!`);
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
      this.logService.error(
        `❌ Erro ao remover itens de ${tableName}`,
        { attributes },
        error as Error
      );
      throw new Error(`Erro ao remover item de ${tableName}: ${String(error)}`);
    }
  };

  getAll = async <T>(tableName: string, options: unknown = {}): Promise<ResultType> => {
    this.logService.info(`📡 Executando Scan (getAll) na tabela ${tableName}...`);
    const scanParameters: {
      TableName: string;
    } = {
      TableName: tableName,
    };

    const cmd = new ScanCommand(scanParameters);
    try {
      const content = await this.client.send(cmd);
      const result = (content.Items ?? []).map((item) => unmarshall(item));

      const sortBy = Object.getOwnPropertyDescriptor(options, 'sortBy')?.value;
      const sortOrder = Object.getOwnPropertyDescriptor(options, 'sortOrder')?.value ?? 1;

      if (sortBy) {
        let finalSortBy = String(sortBy);
        let finalSortOrder = sortOrder;

        const validDirections = ['1', '-1', 'asc', 'desc', 'ascending', 'descending'];
        if (
          !validDirections.includes(String(finalSortOrder).toLowerCase()) &&
          validDirections.includes(String(finalSortBy).toLowerCase())
        ) {
          finalSortBy = String(sortOrder);
          finalSortOrder = sortBy;
        }

        let direction: 1 | -1 = 1;
        const dirStr = String(finalSortOrder).toLowerCase();
        if (dirStr === '-1' || dirStr === 'desc' || dirStr === 'descending') {
          direction = -1;
        }

        const locale = process.env.DYNAMODB_SORT_LOCALE || process.env.MONGODB_SORT_LOCALE || 'pt';
        result.sort((a, b) => {
          const left = this.#normalizeSortValue((a as Record<string, unknown>)[finalSortBy]);
          const right = this.#normalizeSortValue((b as Record<string, unknown>)[finalSortBy]);
          const comparison = left.localeCompare(right, locale, {
            sensitivity: 'base',
            numeric: true,
          });
          return direction === 1 ? comparison : -comparison;
        });
      }

      this.logService.info(
        `✅ Scan (getAll) realizado com sucesso em ${tableName}. Foram retornados ${result.length} item(ns).`
      );
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
      this.logService.error(
        `❌ Erro ao consultar tabela (getAll) ${tableName}`,
        {},
        error as Error
      );
      const resultError = new Error(`Erro ao consultar tabela ${tableName}`);
      resultError.stack = JSON.stringify(error);
      throw resultError;
    }
  };

  getListByMinhotecaIds = async (collectionName: string, ids: string[]): Promise<ResultType> => {
    this.logService.info(`📡 Consultando itens por IDs na coleção ${collectionName}...`);
    try {
      const keys = ids.map((id) => ({ id: { S: id } }));
      const cmd = new BatchGetItemCommand({
        RequestItems: {
          [collectionName]: {
            Keys: keys,
          },
        },
      });
      const content = await this.client.send(cmd);
      const result = (content.Responses?.[collectionName] ?? []).map((item) => unmarshall(item));
      this.logService.info(
        `✅ Consulta por IDs realizada com sucesso em ${collectionName}. Foram retornados ${result.length} item(ns).`
      );
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
      this.logService.error(
        `❌ Erro ao consultar itens por IDs na coleção ${collectionName}`,
        { ids },
        error as Error
      );
      const resultError = new Error(`Erro ao consultar itens por IDs na coleção ${collectionName}`);
      resultError.stack = JSON.stringify(error);
      throw resultError;
    }
  };
}
