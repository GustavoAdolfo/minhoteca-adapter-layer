/* eslint-disable @typescript-eslint/no-explicit-any */
import { MongoClient } from 'mongodb';
import { MongoDBRepository } from '../../../layer/nodejs/src/repositories/mongodb.repository';

jest.mock('mongodb');
jest.mock('@gustavoadolfo/minhoteca-core-layer', () => {
  return {
    LogService: jest.fn().mockImplementation(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    })),
  };
});

describe('MongoDBRepository', () => {
  let repository: MongoDBRepository;
  let mockCollection: any;
  let mockDb: any;
  let mockClient: any;

  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    process.env.MONGODB_USERNAME = 'testuser';
    process.env.MONGODB_PASSWORD = 'testpass';
    process.env.MONGODB_DATABASE = 'testdb';
    process.env.MONGODB_CLUSTER = 'testcluster.mongodb.net';
    process.env.MONGODB_APPNAME = 'testapp';

    mockCollection = {
      insertOne: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn().mockReturnThis(),
      toArray: jest.fn(),
      countDocuments: jest.fn(),
      deleteMany: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findOneAndDelete: jest.fn(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
    };

    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection),
      command: jest.fn().mockResolvedValue({ ok: 1 }),
    };

    mockClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      db: jest.fn().mockReturnValue(mockDb),
      close: jest.fn().mockResolvedValue(undefined),
    };

    (MongoClient as unknown as jest.Mock).mockImplementation(() => mockClient);

    // Reseta o singleton antes de cada teste para garantir um estado limpo
    (MongoDBRepository as any).instance = null;
    repository = MongoDBRepository.getInstance();
  });

  afterEach(() => {
    process.env = OLD_ENV;
    jest.clearAllMocks();
  });

  it('should instantiate successfully with valid environment variables', () => {
    expect(repository).toBeDefined();
    expect(repository.mongoDBConfig.database).toBe('testdb');
  });

  it('should fail instantiation if environment variables are missing', () => {
    delete process.env.MONGODB_USERNAME;

    // Mock temporário do process.exit e console.error para prevenir a parada do test runner
    const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);
    const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    (MongoDBRepository as any).instance = null;

    expect(() => {
      MongoDBRepository.getInstance();
    }).toThrow('process.exit called');

    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('should save data successfully', async () => {
    const testData = { name: 'Test Object' };
    mockCollection.insertOne.mockResolvedValueOnce({ insertedId: '12345' });

    const result = await repository.saveData('TestCollection', testData);

    expect(mockCollection.insertOne).toHaveBeenCalledWith(testData);
    expect(result.data).toEqual({ _id: '12345', ...testData });
    expect(result.totalDocuments).toBe(1);
  });

  it('should retrieve data by minhoteca id successfully', async () => {
    const testData = { id: 'test-id-1', name: 'Test' };
    mockCollection.findOne.mockResolvedValueOnce(testData);

    const result = await repository.findByMinhotecaId('TestCollection', 'test-id-1');

    expect(mockCollection.findOne).toHaveBeenCalledWith({ id: 'test-id-1' });
    expect(result.data).toEqual(testData);
  });

  it('should retrieve all data with pagination successfully', async () => {
    const testData = [{ id: '1' }, { id: '2' }];
    mockCollection.toArray.mockResolvedValueOnce(testData);
    mockCollection.countDocuments.mockResolvedValueOnce(2);

    const result = await repository.getAll('TestCollection', {
      page: 1,
      limit: 10,
    });

    expect(mockCollection.find).toHaveBeenCalledWith({});
    expect(mockCollection.skip).toHaveBeenCalledWith(0);
    expect(mockCollection.limit).toHaveBeenCalledWith(10);
    expect(result.data).toEqual(testData);
    expect(result.totalDocuments).toBe(2);
  });

  it('should remove data successfully', async () => {
    mockCollection.deleteMany.mockResolvedValueOnce({ deletedCount: 1 });

    const result = await repository.removeData('TestCollection', [
      {
        attribute: { AttributeName: 'id' },
        attributeValue: 'test-id',
      } as any,
    ]);

    expect(mockCollection.deleteMany).toHaveBeenCalledWith({ id: 'test-id' });
    expect(result.data.deletedCount).toBe(1);
  });

  it('should throw an error when removing data with empty query', async () => {
    await expect(repository.removeData('TestCollection', [])).rejects.toThrow(
      'Parâmetros inválidos ou vazios fornecidos para exclusão.'
    );
  });

  it('should update data successfully', async () => {
    const updateData = { name: 'Updated Name' };
    const testId = 'test-id';
    mockCollection.findOneAndUpdate.mockResolvedValueOnce(updateData);

    const result = await repository.updateByMinhotecaId('TestCollection', updateData, testId);

    expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
      { id: testId },
      { $set: updateData },
      { returnDocument: 'after' }
    );
    expect(result.data).toEqual(updateData);
  });

  it('should delete by minhoteca id successfully', async () => {
    const testId = 'test-id';
    mockCollection.findOneAndDelete.mockResolvedValueOnce({ id: testId });

    const result = await repository.deleteByMinhotecaId('TestCollection', testId);

    expect(mockCollection.findOneAndDelete).toHaveBeenCalledWith({ id: testId });
    expect(result.data).toEqual([{ id: testId }]);
  });

  it('should query data by specific field', async () => {
    const testData = [{ id: '1', type: 'book' }];
    mockCollection.toArray.mockResolvedValueOnce(testData);

    const params = [{ attribute: { AttributeName: 'type' }, attributeValue: 'book' } as any];

    const result = await repository.queryData('TestCollection', params);

    expect(mockCollection.find).toHaveBeenCalledWith({ type: 'book' });
    expect(result.data).toEqual(testData);
  });

  it('should query data with multiple parameters (select strategy)', async () => {
    const testData = [{ id: '1', status: 'active', type: 'book' }];
    mockCollection.toArray.mockResolvedValueOnce(testData);
    mockCollection.countDocuments.mockResolvedValueOnce(1);

    const params = [
      { attribute: { AttributeName: 'status' }, attributeValue: 'active' } as any,
      { attribute: { AttributeName: 'type' }, attributeValue: 'book' } as any,
    ];

    const result = await repository.queryData('TestCollection', params);

    expect(mockCollection.find).toHaveBeenCalledWith({ status: 'active', type: 'book' }, {});
    expect(result.data).toEqual(testData);
  });

  describe('Edge Cases e Error Handling', () => {
    it('deve retornar a exata mesma instância caso chamada múltiplas vezes (Singleton)', () => {
      const instance1 = MongoDBRepository.getInstance();
      const instance2 = MongoDBRepository.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('deve inicializar e retornar as configurações do banco através do getter mongodb', () => {
      const db1 = repository.mongodb;
      const db2 = repository.mongodb;

      expect(db1).toBeDefined();
      expect(db1).toEqual(db2);
    });

    it('deve lidar com falha na conexão inicial do MongoClient', async () => {
      mockClient.connect.mockRejectedValueOnce(new Error('Connection DB Error'));
      (repository as any).mongoClient = null;

      await expect(repository.getAll('TestCollection')).rejects.toThrow('Connection DB Error');
    });

    it('deve lidar com falha no comando de ping/validação do DB', async () => {
      mockDb.command.mockRejectedValueOnce(new Error('Command DB Error'));
      (repository as any).mongoClient = mockClient;

      mockCollection.toArray.mockResolvedValueOnce([]);
      mockCollection.countDocuments.mockResolvedValueOnce(0);

      await repository.getAll('TestCollection');

      // Como o ping falhou, ele deve ter resetado o mongoClient para null e tentado reconectar logo em seguida
      expect(mockClient.connect).toHaveBeenCalled();
    });

    it('deve lidar com erros em saveData', async () => {
      mockCollection.insertOne.mockRejectedValueOnce(new Error('DB Error'));
      await expect(repository.saveData('TestCollection', { test: 'data' })).rejects.toThrow();
    });

    it('deve retornar dados devidamente formatados em findByMinhotecaId quando o item não for encontrado (nulo)', async () => {
      mockCollection.findOne.mockResolvedValueOnce(null);
      const result = await repository.findByMinhotecaId('TestCollection', 'non-existent');
      expect(result.data).toBeDefined();
    });

    it('deve lidar com erros em findByMinhotecaId', async () => {
      mockCollection.findOne.mockRejectedValueOnce(new Error('DB Error'));
      await expect(repository.findByMinhotecaId('TestCollection', 'test-id')).rejects.toThrow();
    });

    it('não deve aplicar paginação em getAll caso seja omitida', async () => {
      const testData = [{ id: '1' }];
      mockCollection.toArray.mockResolvedValueOnce(testData);
      mockCollection.countDocuments.mockResolvedValueOnce(1);

      // Chamada sem enviar o 2º parâmetro com a interface de paginação
      const result = await repository.getAll('TestCollection');

      expect(mockCollection.skip).not.toHaveBeenCalled();
      expect(mockCollection.limit).not.toHaveBeenCalled();
      expect(result.data).toEqual(testData);
    });

    it('deve lidar corretamente com opções parciais de paginação (apenas limit ou apenas page)', async () => {
      mockCollection.toArray.mockResolvedValue([]);
      mockCollection.countDocuments.mockResolvedValue(0);

      mockCollection.limit.mockClear();
      mockCollection.skip.mockClear();

      // Envia apenas o limit (fazendo page = 0 implicitamente)
      await repository.getAll('TestCollection', { limit: 5 });
      expect(mockCollection.limit).not.toHaveBeenCalled();
      expect(mockCollection.skip).not.toHaveBeenCalled();

      // Envia apenas a page (fazendo limit = 0 implicitamente)
      await repository.getAll('TestCollection', { page: 2 });
      expect(mockCollection.limit).not.toHaveBeenCalled();
      expect(mockCollection.skip).not.toHaveBeenCalled();
    });

    it('deve calcular corretamente hasNextPage e hasPrevPage na paginação', async () => {
      const testData = [{ id: '1' }, { id: '2' }];
      mockCollection.toArray.mockResolvedValueOnce(testData);

      // Simulamos um total de 50 documentos, pedindo a página 2 com limite de 2
      mockCollection.countDocuments.mockResolvedValueOnce(50);

      const result = await repository.getAll('TestCollection', { page: 2, limit: 2 });

      expect(result.currentPage).toBe(2);
      expect(result.hasPrevPage).toBe(true); // Porque estamos na página 2
      expect(result.hasNextPage).toBe(true); // Porque 2 * 2 (4) é menor que 50
    });

    it('deve lidar com erros do countDocuments em getAll', async () => {
      mockCollection.toArray.mockResolvedValueOnce([{ id: '1' }]);
      mockCollection.countDocuments.mockRejectedValueOnce(new Error('Count Error'));

      await expect(repository.getAll('TestCollection', { page: 1, limit: 10 })).rejects.toThrow();
    });

    it('deve lidar com erros do countDocuments em queryData', async () => {
      mockCollection.toArray.mockResolvedValueOnce([{ id: '1' }]);
      mockCollection.countDocuments.mockRejectedValueOnce(new Error('Count Error'));

      await expect(
        repository.queryData('TestCollection', [
          { attribute: { AttributeName: 'type' }, attributeValue: 'book' } as any,
          { attribute: { AttributeName: 'status' }, attributeValue: 'active' } as any,
        ])
      ).rejects.toThrow();
    });

    it('deve lidar com erros em getAll', async () => {
      mockCollection.toArray.mockRejectedValueOnce(new Error('DB Error'));
      await expect(repository.getAll('TestCollection')).rejects.toThrow();
    });

    it('deve lidar com erros em removeData', async () => {
      mockCollection.deleteMany.mockRejectedValueOnce(new Error('DB Error'));
      await expect(
        repository.removeData('TestCollection', [
          { attribute: { AttributeName: 'id' }, attributeValue: 'test' } as any,
        ])
      ).rejects.toThrow();
    });

    it('deve retornar formato correto em updateByMinhotecaId se item for inexistente (nulo)', async () => {
      mockCollection.findOneAndUpdate.mockResolvedValueOnce(null);
      const result = await repository.updateByMinhotecaId(
        'TestCollection',
        { name: 'test' },
        'test-id'
      );
      expect(result.data).toBeDefined();
    });

    it('deve lidar com erros em updateByMinhotecaId', async () => {
      mockCollection.findOneAndUpdate.mockRejectedValueOnce(new Error('DB Error'));
      await expect(
        repository.updateByMinhotecaId('TestCollection', { name: 'test' }, 'test-id')
      ).rejects.toThrow();
    });

    it('deve retornar formato correto em deleteByMinhotecaId se item for inexistente (nulo)', async () => {
      mockCollection.findOneAndDelete.mockResolvedValueOnce(null);
      const result = await repository.deleteByMinhotecaId('TestCollection', 'test-id');
      expect(result.data).toBeDefined();
    });

    it('deve lidar com erros em deleteByMinhotecaId', async () => {
      mockCollection.findOneAndDelete.mockRejectedValueOnce(new Error('DB Error'));
      await expect(repository.deleteByMinhotecaId('TestCollection', 'test-id')).rejects.toThrow();
    });

    it('deve lançar erro em queryData para atributos inválidos/vazios', async () => {
      await expect(repository.queryData('TestCollection', [])).rejects.toThrow();
    });

    it('deve lidar com erros em queryData', async () => {
      mockCollection.toArray.mockRejectedValueOnce(new Error('DB Error'));
      await expect(
        repository.queryData('TestCollection', [
          { attribute: { AttributeName: 'type' }, attributeValue: 'book' } as any,
        ])
      ).rejects.toThrow();
    });

    it('deve fechar a conexão de forma síncrona no evento exit do processo (cobre #closeSync)', () => {
      const processOnSpy = jest.spyOn(process, 'on');

      // Instanciamos um novo repositório forçando a recriação (Singleton) para testar o registro no process.on('exit')
      (MongoDBRepository as any).instance = null;
      const newRepo = MongoDBRepository.getInstance();
      (newRepo as any).mongoClient = mockClient;

      // Procuramos o callback registrado para o evento 'exit'
      const exitCall = processOnSpy.mock.calls.find((call) => call[0] === 'exit');
      expect(exitCall).toBeDefined();

      const exitCallback = exitCall![1] as Function;

      // Executamos o callback (que internamente chama o método privado #closeSync)
      expect(() => exitCallback()).not.toThrow();
      expect((newRepo as any).mongoClient).toBeNull();

      processOnSpy.mockRestore();
    });

    it('deve fechar a conexão de forma assíncrona (closeConnection)', async () => {
      (repository as any).mongoClient = mockClient;
      await repository.closeConnection();
      expect(mockClient.close).toHaveBeenCalled();
      expect((repository as any).mongoClient).toBeNull();
    });

    it('deve lidar com erros ao fechar a conexão em closeConnection', async () => {
      (repository as any).mongoClient = mockClient;
      mockClient.close.mockRejectedValueOnce(new Error('Close Error'));
      await repository.closeConnection();
      // A classe foi desenhada para absorver a exceção e forçar a deleção da variável da memória
      expect((repository as any).mongoClient).toBeNull();
    });

    it('não deve lançar erros no closeConnection se o client não estiver instanciado', async () => {
      (repository as any).mongoClient = null;
      await expect(repository.closeConnection()).resolves.toBeUndefined();
    });

    it('deve lançar erro em validações de parâmetros vazios ou nulos', async () => {
      // Tenta cobrir cenários genéricos de throws e catches em validações comuns
      await expect(
        repository.updateByMinhotecaId('TestCollection', null as any, 'test-id')
      ).rejects.toThrow();
      await expect(
        repository.updateByMinhotecaId('TestCollection', [] as any, 'test-id')
      ).rejects.toThrow();
      await expect(repository.saveData('TestCollection', null as any)).rejects.toThrow();
    });
  });

  describe('Cobertura Adicional (Select, Projections, Race Conditions)', () => {
    it('deve lançar erro Method not implemented ao chamar getData', async () => {
      await expect(
        repository.getData('TestTable', { name: 'id', type: 'S', value: '1' })
      ).rejects.toThrow('Method not implemented.');
    });

    it('deve chamar findByMinhotecaId a partir de queryData quando buscar por id', async () => {
      const spy = jest
        .spyOn(repository, 'findByMinhotecaId')
        .mockResolvedValueOnce({ data: [] } as any);
      await repository.queryData('TestTable', [
        { attribute: { AttributeName: 'ID' }, attributeValue: '123' } as any,
      ]);
      expect(spy).toHaveBeenCalledWith('TestTable', '123');
    });

    it('deve executar getAll com debug de query habilitado e ordenação invertida (descending)', async () => {
      process.env.MONGODB_DEBUG_QUERY = 'true';
      mockCollection.toArray.mockResolvedValueOnce([]);
      mockCollection.countDocuments.mockResolvedValueOnce(0);

      await repository.getAll('TestTable', {
        filterKey: 'name',
        filterValue: 'teste',
        sortBy: 'desc', // Passado de forma invertida para acionar a lógica de correção
        sortOrder: 'titulo',
      });

      expect(mockCollection.sort).toHaveBeenCalledWith({ titulo: -1 });
      process.env.MONGODB_DEBUG_QUERY = 'false'; // reseta
    });

    it('deve lidar com filterByField sucesso e erro', async () => {
      mockCollection.find.mockReturnValueOnce({
        toArray: jest.fn().mockResolvedValueOnce([{ id: '1' }]),
      });
      const res = await repository.filterByField('TestTable', 'field', 'value');
      expect(res.data).toHaveLength(1);

      mockCollection.find.mockReturnValueOnce({
        toArray: jest.fn().mockRejectedValueOnce(new Error('Filter error')),
      });
      await expect(repository.filterByField('TestTable', 'field', 'value')).rejects.toThrow(
        'Filter error'
      );
    });

    describe('Select e FindWithProjection', () => {
      it('deve selecionar documentos usando projection array e order invertida (asc)', async () => {
        mockCollection.toArray.mockResolvedValueOnce([]);
        mockCollection.countDocuments.mockResolvedValueOnce(0);
        await repository.select(
          'TestTable',
          {},
          { projection: ['name'], sortBy: 'asc', sortOrder: 'titulo' }
        );

        expect(mockCollection.find).toHaveBeenCalledWith({}, { projection: { name: 1 } });
        expect(mockCollection.sort).toHaveBeenCalledWith({ titulo: 1 });
      });

      it('deve consultar documentos (findWithProjection) usando projection objeto e order invertida (desc)', async () => {
        mockCollection.toArray.mockResolvedValueOnce([]);
        mockCollection.countDocuments.mockResolvedValueOnce(0);
        await repository.findWithProjection(
          'TestTable',
          {},
          { name: 1 },
          { sortBy: 'desc', sortOrder: 'titulo' }
        );

        expect(mockCollection.find).toHaveBeenCalledWith({}, { projection: { name: 1 } });
        expect(mockCollection.sort).toHaveBeenCalledWith({ titulo: -1 });
      });

      it('deve consultar documentos (findWithProjection) usando projection array e ordenação padrão', async () => {
        mockCollection.toArray.mockResolvedValueOnce([]);
        mockCollection.countDocuments.mockResolvedValueOnce(0);
        await repository.findWithProjection('TestTable', {}, ['name'], { sortBy: 'titulo' });

        expect(mockCollection.find).toHaveBeenCalledWith({}, { projection: { name: 1 } });
        expect(mockCollection.sort).toHaveBeenCalledWith({ titulo: 1 });
      });

      it('deve lidar com falhas de DB nos métodos de seleção e projeção', async () => {
        mockCollection.toArray.mockRejectedValueOnce(new Error('Select error'));
        await expect(repository.select('TestTable')).rejects.toThrow('Select error');

        mockCollection.toArray.mockRejectedValueOnce(new Error('Proj error'));
        await expect(repository.findWithProjection('TestTable')).rejects.toThrow('Proj error');
      });

      it('não deve aplicar skip e limit em findWithProjection se limit for 0', async () => {
        mockCollection.toArray.mockResolvedValueOnce([]);
        mockCollection.countDocuments.mockResolvedValueOnce(0);
        await repository.findWithProjection('TestTable', {}, { name: 1 }, { limit: 0, page: 1 });
        expect(mockCollection.limit).not.toHaveBeenCalled();
      });

      it('deve ignorar projection se for de tipo inválido em findWithProjection', async () => {
        mockCollection.toArray.mockResolvedValueOnce([]);
        mockCollection.countDocuments.mockResolvedValueOnce(0);
        await repository.findWithProjection('TestTable', {}, 'invalid_string' as any);
        expect(mockCollection.find).toHaveBeenCalledWith({}, {});
      });

      it('deve ignorar projection se for de tipo inválido em select', async () => {
        mockCollection.toArray.mockResolvedValueOnce([]);
        mockCollection.countDocuments.mockResolvedValueOnce(0);
        await repository.select('TestTable', {}, { projection: 'invalid_string' });
        expect(mockCollection.find).toHaveBeenCalledWith({}, {});
      });
    });

    describe('Gerenciamento de Conexões e Race Conditions', () => {
      it('deve aguardar se a conexão já estiver em andamento', async () => {
        (repository as any).isConnecting = true;
        (repository as any).mongoClient = null;

        // Simulamos a finalização da conexão por outra requisição após 50ms
        setTimeout(() => {
          (repository as any).isConnecting = false;
          (repository as any).mongoClient = mockClient;
        }, 50);

        const result = await repository.getAll('TestTable');
        expect(result).toBeDefined();
      });

      it('deve reutilizar cliente sem checar a saúde se isHealthChecking for verdadeiro (evita duplo ping)', async () => {
        (repository as any).mongoClient = mockClient;
        (repository as any).isHealthChecking = true;

        await repository.getAll('TestTable');

        expect(mockDb.command).not.toHaveBeenCalled(); // Não acionou ping porque estava marcado como checando
      });

      it('deve esgotar as tentativas de espera se a conexão ficar travada (MAX_RETRIES)', async () => {
        (repository as any).isConnecting = true;
        (repository as any).MAX_RETRIES = 1;
        (repository as any).RETRY_DELAY = 10;

        await expect(repository.getAll('TestTable')).rejects.toThrow(
          'Connection already in progress'
        );
      });
    });

    describe('Branches de Fallbacks e Condicionais Adicionais', () => {
      it('deve formatar URI sem srv para clusters locais (branch isAtlas falso)', () => {
        process.env.MONGODB_CLUSTER = 'localhost:27017';
        (MongoDBRepository as any).instance = null;
        const repoLocal = MongoDBRepository.getInstance();
        const config = repoLocal.mongoDBConfig;
        expect(config.uri).toBe(
          'mongodb://testuser:testpass@localhost:27017/?retryWrites=true&w=majority&appName=testapp'
        );
      });

      it('deve ignorar atributos sem AttributeName no reduce do removeData', async () => {
        mockCollection.deleteMany.mockResolvedValueOnce({ deletedCount: 1 });
        await repository.removeData('TestTable', [
          { attribute: { AttributeName: 'id' }, attributeValue: '123' } as any,
          { attribute: {}, attributeValue: 'ignored' } as any,
        ]);
        expect(mockCollection.deleteMany).toHaveBeenCalledWith({ id: '123' });
      });

      it('deve usar fallback de AttributeName vazio no queryData com 1 parâmetro', async () => {
        mockCollection.find.mockReturnValueOnce({
          toArray: jest.fn().mockResolvedValueOnce([]),
        });
        await repository.queryData('TestTable', [{ attribute: {}, attributeValue: 'val' } as any]);
        expect(mockCollection.find).toHaveBeenCalledWith({ '': 'val' });
      });

      it('deve usar fallback de AttributeName vazio no queryData com múltiplos parâmetros', async () => {
        mockCollection.toArray.mockResolvedValueOnce([]);
        mockCollection.countDocuments.mockResolvedValueOnce(0);
        await repository.queryData('TestTable', [
          { attribute: { AttributeName: 'valid' }, attributeValue: 'v1' } as any,
          { attribute: {}, attributeValue: 'v2' } as any,
        ]);
        expect(mockCollection.find).toHaveBeenCalledWith({ valid: 'v1', '': 'v2' }, {});
      });

      it('deve escapar caracteres especiais no filterValue em getAll', async () => {
        mockCollection.toArray.mockResolvedValueOnce([]);
        mockCollection.countDocuments.mockResolvedValueOnce(0);
        await repository.getAll('TestTable', { filterKey: 'name', filterValue: 'teste.*+?' });
        expect(mockCollection.find).toHaveBeenCalledWith({
          name: { $regex: 'teste\\.\\*\\+\\?', $options: 'i' },
        });
      });
    });
  });
});
