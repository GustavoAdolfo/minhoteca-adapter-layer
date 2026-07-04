/* eslint-disable @typescript-eslint/no-explicit-any */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DynamoDBRepository } from '../../../layer/nodejs/src/repositories/dynamodb.repository';
import { KeyValueAttr } from '../../../layer/nodejs/src/interfaces';
import * as awsClientFactory from '../../../layer/nodejs/src/factories/aws-client.factory';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

jest.mock('../../../layer/nodejs/src/factories/aws-client.factory');
jest.mock('@aws-sdk/lib-dynamodb', () => {
  const actual = jest.requireActual('@aws-sdk/lib-dynamodb');
  return {
    ...{ actual },
    DynamoDBDocumentClient: {
      from: jest.fn(),
    },
    PutCommand: jest.fn().mockImplementation((params: unknown) => params),
    DeleteCommand: jest.fn().mockImplementation((params: unknown) => params),
    QueryCommand: jest.fn().mockImplementation((params: unknown) => params),
    ScanCommand: jest.fn().mockImplementation((params: unknown) => params),
    GetCommand: jest.fn().mockImplementation((params: unknown) => params),
    UpdateCommand: jest.fn().mockImplementation((params: unknown) => params),
  };
});

describe('DynamoDBRepository', () => {
  let repository: DynamoDBRepository;
  let mockSend: any;
  let mockDocumentClient: unknown;
  let capturedSaveDataCalls: Array<{ tableName: string; itemData: unknown; timestamp: string }> =
    [];

  beforeEach(() => {
    jest.clearAllMocks();
    capturedSaveDataCalls = [];

    mockSend = jest.fn(async () => {
      return Promise.resolve({});
    });

    mockDocumentClient = {
      send: mockSend,
    };

    (DynamoDBDocumentClient.from as jest.Mock).mockReturnValue(mockDocumentClient);
    (awsClientFactory.createClient as jest.Mock).mockReturnValue({});

    repository = new DynamoDBRepository();

    const originalSaveData = repository.saveData;
    repository.saveData = jest.fn(async (tableName: string, itemData: Record<string, unknown>) => {
      capturedSaveDataCalls.push({
        tableName,
        itemData: typeof itemData === 'object' && itemData !== null ? { ...itemData } : itemData,
        timestamp: new Date().toISOString(),
      });
      return originalSaveData.call(repository, tableName, itemData);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    capturedSaveDataCalls = [];
  });

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('should call saveData method', async () => {
    const itemData = { id: '123', name: 'Test Item' };
    await repository.saveData('TestTable', itemData);

    expect(mockSend).toHaveBeenCalled();
  });

  it('should send PutCommand with correct parameters', async () => {
    const tableName = 'TestTable';
    const itemData = { id: '123', name: 'Test Item' };

    await repository.saveData(tableName, itemData);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const putCommand = mockSend.mock.calls[0][0];

    expect(putCommand).toBeDefined();

    expect(capturedSaveDataCalls).toHaveLength(1);
    expect(capturedSaveDataCalls[0].tableName).toBe(tableName);
    expect(capturedSaveDataCalls[0].itemData).toEqual(itemData);
  });

  it('should capture multiple saveData calls in temporary storage', async () => {
    const calls = [
      { tableName: 'Users', itemData: { id: '1', name: 'Alice' } },
      { tableName: 'Books', itemData: { id: '2', title: 'TypeScript Guide' } },
      { tableName: 'Users', itemData: { id: '3', name: 'Bob' } },
    ];

    for (const call of calls) {
      await repository.saveData(call.tableName, call.itemData);
    }

    expect(capturedSaveDataCalls).toHaveLength(3);
    expect(capturedSaveDataCalls[0]).toMatchObject(calls[0]);
    expect(capturedSaveDataCalls[1]).toMatchObject(calls[1]);
    expect(capturedSaveDataCalls[2]).toMatchObject(calls[2]);

    expect(new Date(capturedSaveDataCalls[0].timestamp).getTime()).toBeLessThanOrEqual(
      new Date(capturedSaveDataCalls[2].timestamp).getTime()
    );
  });

  it('should access captured data after test completes', async () => {
    const itemData = { id: '999', name: 'Final Item' };
    await repository.saveData('FinalTable', itemData);

    expect(capturedSaveDataCalls[0]).toMatchObject({
      tableName: 'FinalTable',
      itemData,
    });
  });

  it('should retrieve data with filter from DynamoDB', async () => {
    const tableName = 'TestTable';
    const commonName = 'Common Name Filter Test';
    const itemId1 = 'filter-test-id-1';
    await repository.saveData(tableName, { id: itemId1, name: commonName, age: 25 });

    const attribute1: KeyValueAttr = {
      attribute: {
        AttributeName: 'name',
        AttributeType: 'S',
      },
      attributeValue: commonName,
      partitionKey: false,
      sortKey: false,
    };

    mockSend.mockImplementationOnce(() =>
      Promise.resolve({
        Items: [
          {
            id: { S: itemId1 },
            name: { S: commonName },
            age: { N: '25' },
          },
        ],
      })
    );

    const result = await repository.queryData(tableName, [attribute1]);
    expect(result.data).toBeDefined();
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    expect(result.data[0]).toHaveProperty('id', itemId1);
  });

  it('should retrieve all data from DynamoDB', async () => {
    // Força o mockSend a devolver o formato vazio padrão, caso contrário 'Items' ficaria undefined
    mockSend.mockImplementationOnce(() => Promise.resolve({ Items: [] }));

    const tableName = process.env.TEST_TABLE_NAME ?? 'TestTable';
    const result = await repository.getAll(tableName);
    expect(result).toBeDefined();

    expect(Array.isArray(result.data)).toBe(true);
  });

  describe('updateByMinhotecaId', () => {
    it('deve atualizar o item com sucesso', async () => {
      const mockAttributes = { id: '123', name: 'Updated' };
      mockSend.mockResolvedValueOnce({ Attributes: mockAttributes });

      const result = await repository.updateByMinhotecaId('TestTable', { name: 'Updated' }, '123');
      expect(result.data).toEqual([mockAttributes]);
    });

    it('deve retornar vazio se não houver atributos para atualizar', async () => {
      const result = await repository.updateByMinhotecaId('TestTable', { id: '123' }, '123');
      expect(result.data).toEqual([]);
    });

    it('deve lidar com retorno da AWS sem Attributes (fallback)', async () => {
      mockSend.mockResolvedValueOnce({}); // Resposta do DB sem o objeto Attributes
      const result = await repository.updateByMinhotecaId('TestTable', { name: 'Updated' }, '123');
      expect(result.data).toEqual([]);
      expect(result.totalDocuments).toBe(0);
      expect(result.limit).toBe(0);
    });

    it('deve lançar erro se os dados forem inválidos', async () => {
      await expect(repository.updateByMinhotecaId('TestTable', null as any, '123')).rejects.toThrow(
        'Parâmetro data deve ser um objeto'
      );
      await expect(repository.updateByMinhotecaId('TestTable', [] as any, '123')).rejects.toThrow(
        'Parâmetro data deve ser um objeto'
      );
    });

    it('deve lançar erro em caso de falha no banco', async () => {
      mockSend.mockRejectedValueOnce(new Error('DB Error'));
      await expect(
        repository.updateByMinhotecaId('TestTable', { name: 'test' }, '123')
      ).rejects.toThrow('Erro ao atualizar item em TestTable');
    });
  });

  describe('deleteByMinhotecaId', () => {
    it('deve remover o item com sucesso', async () => {
      const mockAttributes = { id: '123', name: 'Deleted' };
      mockSend.mockResolvedValueOnce({ Attributes: mockAttributes });

      const result = await repository.deleteByMinhotecaId('TestTable', '123');
      expect(result.data).toEqual([mockAttributes]);
    });

    it('deve retornar lista vazia se item não existir', async () => {
      mockSend.mockResolvedValueOnce({});
      const result = await repository.deleteByMinhotecaId('TestTable', '123');
      expect(result.data).toEqual([]);
    });

    it('deve lançar erro em caso de falha no banco', async () => {
      mockSend.mockRejectedValueOnce(new Error('DB Error'));
      await expect(repository.deleteByMinhotecaId('TestTable', '123')).rejects.toThrow(
        'Erro ao remover item por ID em TestTable'
      );
    });
  });

  describe('findByMinhotecaId', () => {
    it('deve chamar queryData corretamente', async () => {
      const queryDataSpy = jest
        .spyOn(repository, 'queryData')
        .mockResolvedValueOnce({ data: [{ id: '123' }] } as never);
      await repository.findByMinhotecaId('TestTable', '123');

      expect(queryDataSpy).toHaveBeenCalledWith('TestTable', expect.any(Array));
    });
  });

  describe('getData', () => {
    it('deve consultar com hashKey e sortKey', async () => {
      mockSend.mockResolvedValueOnce({ Items: [{ id: { S: '123' } }] });

      const result = await repository.getData(
        'TestTable',
        { name: 'id', type: 'S', value: '123' },
        { name: 'sk', type: 'N', value: '1' }
      );
      expect(result.data).toHaveLength(1);
    });

    it('deve lidar com retorno sem Items (fallback para array vazio)', async () => {
      mockSend.mockResolvedValueOnce({});
      const result = await repository.getData('TestTable', { name: 'id', type: 'S', value: '123' });
      expect(result.data).toEqual([]);
    });

    it('deve lançar erro em caso de falha', async () => {
      mockSend.mockRejectedValueOnce(new Error('DB Error'));
      await expect(
        repository.getData('TestTable', { name: 'id', type: 'S', value: '123' })
      ).rejects.toThrow('Erro ao consultar tabela TestTable');
    });
  });

  describe('queryData', () => {
    it('deve lançar erro para parâmetros inválidos', async () => {
      await expect(
        repository.queryData('TestTable', [{ attribute: {}, attributeValue: 'val' } as any])
      ).rejects.toThrow('Parâmetros inválidos para consulta DynamoDB');
    });

    it('deve lançar erro se scan falhar', async () => {
      mockSend.mockRejectedValueOnce(new Error('DB Error'));
      await expect(
        repository.queryData('TestTable', [
          {
            attribute: { AttributeName: 'name', AttributeType: 'S' },
            attributeValue: 'val',
          } as any,
        ])
      ).rejects.toThrow('Erro ao consultar tabela TestTable');
    });

    it('deve chamar getData quando partitionKey for fornecida', async () => {
      const getDataSpy = jest
        .spyOn(repository, 'getData')
        .mockResolvedValueOnce({ data: [] } as never);

      await repository.queryData('TestTable', [
        {
          attribute: { AttributeName: 'pk', AttributeType: 'S' },
          attributeValue: '123',
          partitionKey: true,
          sortKey: false,
        },
      ]);

      expect(getDataSpy).toHaveBeenCalledWith(
        'TestTable',
        { name: 'pk', type: 'S', value: '123' },
        undefined
      );
    });

    it('deve chamar getData quando partitionKey e sortKey forem fornecidas', async () => {
      const getDataSpy = jest
        .spyOn(repository, 'getData')
        .mockResolvedValueOnce({ data: [] } as never);
      await repository.queryData('TestTable', [
        {
          attribute: { AttributeName: 'pk', AttributeType: 'S' },
          attributeValue: '123',
          partitionKey: true,
          sortKey: false,
        },
        {
          attribute: { AttributeName: 'sk', AttributeType: 'N' },
          attributeValue: '1',
          partitionKey: false,
          sortKey: true,
        },
      ]);
      expect(getDataSpy).toHaveBeenCalledWith(
        'TestTable',
        { name: 'pk', type: 'S', value: '123' },
        { name: 'sk', type: 'N', value: '1' }
      );
    });

    it('deve executar Scan com múltiplos filtros', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });
      await repository.queryData('TestTable', [
        { attribute: { AttributeName: 'attr1', AttributeType: 'S' }, attributeValue: 'v1' },
        { attribute: { AttributeName: 'attr2', AttributeType: 'S' }, attributeValue: 'v2' },
      ] as any);
      expect(mockSend).toHaveBeenCalled();
    });

    it('deve executar Scan sem filtros quando array for vazio', async () => {
      mockSend.mockResolvedValueOnce({ Items: [] });
      await repository.queryData('TestTable', []);
      expect(mockSend).toHaveBeenCalled();
    });

    it('deve lidar com retorno sem Items em Scan (fallback)', async () => {
      mockSend.mockResolvedValueOnce({});
      const result = await repository.queryData('TestTable', [
        { attribute: { AttributeName: 'attr1', AttributeType: 'S' }, attributeValue: 'v1' },
      ] as any);
      expect(result.data).toEqual([]);
    });
  });

  describe('removeData', () => {
    it('deve lançar erro para parâmetros inválidos', async () => {
      await expect(
        repository.removeData('TestTable', [{ attribute: {}, attributeValue: 'val' } as any])
      ).rejects.toThrow('Parâmetros inválidos para remover items de DynamoDB');
    });

    it('deve retornar mensagem se não encontrar itens para remover', async () => {
      jest.spyOn(repository, 'queryData').mockResolvedValueOnce({ data: [] } as never);
      const result = await repository.removeData('TestTable', [
        { attribute: { AttributeName: 'name', AttributeType: 'S' }, attributeValue: 'val' } as any,
      ]);

      expect(result.data).toHaveProperty('success', true);
      expect((result.data as any).message).toMatch(/Nenhum item encontrado/);
    });

    it('deve lançar erro se partitionKey não for encontrada', async () => {
      jest
        .spyOn(repository, 'queryData')
        .mockResolvedValueOnce({ data: [{ name: 'val' }] } as never);
      await expect(
        repository.removeData('TestTable', [
          {
            attribute: { AttributeName: 'name', AttributeType: 'S' },
            attributeValue: 'val',
          } as any,
        ])
      ).rejects.toThrow('Partition key é obrigatória para remover items');
    });

    it('deve remover itens com sucesso usando partitionKey e sortKey', async () => {
      jest
        .spyOn(repository, 'queryData')
        .mockResolvedValueOnce({ data: [{ pk: '1', sk: '2' }] } as never);
      mockSend.mockResolvedValueOnce({}); // simulação do DeleteCommand

      const result = await repository.removeData(
        'TestTable',
        [
          {
            attribute: { AttributeName: 'pk', AttributeType: 'S' },
            attributeValue: '1',
            partitionKey: true,
          } as any,
        ],
        undefined,
        'sk'
      );
      expect(result.data).toHaveProperty('success', true);
      expect((result.data as any).message).toMatch(/1 item\(ns\) removido/);
      expect(mockSend).toHaveBeenCalled();
    });

    it('deve remover usando partKeyName e sortKeyName passados por parâmetro', async () => {
      jest
        .spyOn(repository, 'queryData')
        .mockResolvedValueOnce({ data: [{ pk: '1', sk: '2' }] } as never);
      mockSend.mockResolvedValueOnce({});
      const result = await repository.removeData(
        'TestTable',
        [{ attribute: { AttributeName: 'pk', AttributeType: 'S' }, attributeValue: '1' } as any],
        'pk',
        'sk'
      );
      expect(result.data).toHaveProperty('success', true);
    });

    it('deve remover sem sortKeyName se o item não possuir o atributo', async () => {
      jest.spyOn(repository, 'queryData').mockResolvedValueOnce({ data: [{ pk: '1' }] } as never); // Item sem 'sk'
      mockSend.mockResolvedValueOnce({});
      const result = await repository.removeData(
        'TestTable',
        [{ attribute: { AttributeName: 'pk', AttributeType: 'S' }, attributeValue: '1' } as any],
        'pk',
        'sk'
      );
      expect(result.data).toHaveProperty('success', true);
    });

    it('deve lançar erro se ocorrer falha na exclusão no banco de dados (catch)', async () => {
      jest.spyOn(repository, 'queryData').mockResolvedValueOnce({ data: [{ pk: '1' }] } as never);
      mockSend.mockRejectedValueOnce(new Error('DynamoDB Error'));

      await expect(
        repository.removeData('TestTable', [
          {
            attribute: { AttributeName: 'pk', AttributeType: 'S' },
            attributeValue: '1',
            partitionKey: true,
          } as any,
        ])
      ).rejects.toThrow('Erro ao remover item de TestTable: Error: DynamoDB Error');
    });
  });

  describe('getAll', () => {
    it('deve retornar dados mapeados (unmarshall) com sucesso', async () => {
      mockSend.mockResolvedValueOnce({ Items: [{ id: { S: '123' }, name: { S: 'test' } }] });
      const result = await repository.getAll('TestTable');
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual({ id: '123', name: 'test' });
    });

    it('deve lançar erro em caso de falha', async () => {
      mockSend.mockRejectedValueOnce(new Error('DB Error'));
      await expect(repository.getAll('TestTable')).rejects.toThrow(
        'Erro ao consultar tabela TestTable'
      );
    });

    it('deve lidar com retorno sem Items (fallback para array vazio)', async () => {
      mockSend.mockResolvedValueOnce({});
      const result = await repository.getAll('TestTable');
      expect(result.data).toEqual([]);
    });
  });

  describe('getListByMinhotecaIds', () => {
    it('deve consultar itens por IDs com sucesso', async () => {
      const ids = ['id-1', 'id-2'];
      mockSend.mockResolvedValueOnce({
        Responses: {
          TestCollection: [
            { id: { S: 'id-1' }, name: { S: 'Primeiro' } },
            { id: { S: 'id-2' }, name: { S: 'Segundo' } },
          ],
        },
      });

      const result = await repository.getListByMinhotecaIds('TestCollection', ids);

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      expect(command.input).toEqual({
        RequestItems: {
          TestCollection: {
            Keys: [{ id: { S: 'id-1' } }, { id: { S: 'id-2' } }],
          },
        },
      });
      expect(result.data).toEqual([
        { id: 'id-1', name: 'Primeiro' },
        { id: 'id-2', name: 'Segundo' },
      ]);
      expect(result.totalDocuments).toBe(2);
      expect(result.limit).toBe(2);
    });

    it('deve retornar lista vazia quando Responses não vier preenchido', async () => {
      mockSend.mockResolvedValueOnce({});

      const result = await repository.getListByMinhotecaIds('TestCollection', ['id-1']);

      expect(result.data).toEqual([]);
      expect(result.totalDocuments).toBe(0);
      expect(result.limit).toBe(0);
    });

    it('deve lançar erro em caso de falha no BatchGet', async () => {
      mockSend.mockRejectedValueOnce(new Error('DB Error'));

      await expect(repository.getListByMinhotecaIds('TestCollection', ['id-1'])).rejects.toThrow(
        'Erro ao consultar itens por IDs na coleção TestCollection'
      );
    });
  });
});
