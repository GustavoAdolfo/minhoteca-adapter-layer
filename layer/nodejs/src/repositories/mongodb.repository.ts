import { MongoClient } from 'mongodb';
import { GetAllOptions, KeyValueAttr, RepositoryInterface } from '../interfaces';
import { ResultType } from '../interfaces/result.type';
import { LogService } from '@gustavoadolfo/minhoteca-core-layer';

export class MongoDBRepository implements RepositoryInterface {
  private logService = new LogService('MongoDBRepository');
  private static instance: MongoDBRepository | null = null;
  mongoClient: MongoClient | null = null;
  mongoDBConfig: {
    username: string | undefined;
    password: string | undefined;
    database: string | undefined;
    cluster: string | undefined;
    uri: string | undefined;
  };
  private isConnecting = false;
  private isHealthChecking = false; // Novo: previne race condition no health check
  private MAX_RETRIES = 3;
  private RETRY_DELAY = 100; // ms

  constructor() {
    this.#validateEnvironment();
    this.mongoDBConfig = this.mongodb;
    this.logService.info('✅ Configuração do MongoDB carregada do config centralizado');

    // Fechar gracefully quando o processo terminar
    process.on('exit', () => {
      this.#closeSync();
    });
  }

  /**
   * Singleton pattern para reutilizar instância
   */
  static getInstance(): MongoDBRepository {
    if (!MongoDBRepository.instance) {
      MongoDBRepository.instance = new MongoDBRepository();
    }
    return MongoDBRepository.instance;
  }

  #validateEnvironment() {
    const requiredVars = [
      'MONGODB_USERNAME',
      'MONGODB_PASSWORD',
      'MONGODB_DATABASE',
      'MONGODB_CLUSTER',
    ];

    const missingVars = requiredVars.filter((varName) => !process.env[varName]);

    if (missingVars.length > 0) {
      this.logService.error('❌ Variáveis de ambiente obrigatórias ausentes:', { missingVars });
      this.logService.error('\nPor favor, crie um arquivo .env baseado no .env.example');
      process.exit(1);
    }

    this.logService.info('✅ Variáveis de ambiente validadas com sucesso');
  }

  get mongodb() {
    const isAtlas = process.env.MONGODB_CLUSTER?.includes('mongodb.net');
    const uri = isAtlas
      ? `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_CLUSTER}/?retryWrites=true&w=majority&appName=${process.env.MONGODB_APPNAME}`
      : `mongodb://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_CLUSTER}/?retryWrites=true&w=majority&appName=${process.env.MONGODB_APPNAME}`;
    this.logService.info('🔗 URI do MongoDB construída:', { uri });
    return {
      username: process.env.MONGODB_USERNAME,
      password: process.env.MONGODB_PASSWORD,
      database: process.env.MONGODB_DATABASE,
      cluster: process.env.MONGODB_CLUSTER,
      uri,
    };
  }

  async #getConnection() {
    // Espera se estiver conectando
    let retries = 0;
    while (this.isConnecting && retries < this.MAX_RETRIES) {
      this.logService.info(
        `⏳ Esperando conexão em andamento... (tentativa ${retries + 1}/${this.MAX_RETRIES})`
      );
      await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));
      retries++;
    }

    // Se cliente está ativo, reutiliza (sem verificar saúde sempre)
    if (this.mongoClient) {
      this.logService.info('♻️ Reutilizando conexão MongoDB existente');

      // Verifica saúde RARAMENTE para evitar race condition
      if (!this.isHealthChecking) {
        this.isHealthChecking = true;
        try {
          this.logService.info('🔍 Verificando saúde da conexão MongoDB...');
          await this.mongoClient.db('admin').command({ ping: 1 });
          this.logService.info('✅ Conexão MongoDB está viva');
        } catch (error) {
          this.logService.error(
            '⚠️ Cliente MongoDB não está respondendo, redefinindo...',
            {},
            error as Error
          );
          this.mongoClient = null;
        } finally {
          this.isHealthChecking = false;
        }
      }
    }

    // Se não tem cliente após health check, conecta
    if (!this.mongoClient) {
      this.logService.info('📡 Nenhuma conexão ativa, conectando...');
      this.mongoClient = await this.#connectToCluster();
    }

    return this.mongoClient;
  }

  async #connectToCluster() {
    if (this.isConnecting) {
      throw new Error('Connection already in progress');
    }

    this.isConnecting = true;

    try {
      const mongoClient = new MongoClient(this.mongoDBConfig.uri ?? '', {
        maxPoolSize: 1, // Lambda: apenas 1 conexão por instância
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });

      this.logService.info('🔗 Conectando ao cluster do MongoDB Atlas...');
      await mongoClient.connect();
      this.logService.info('✅ Conectado com sucesso ao MongoDB Atlas!');

      return mongoClient;
    } catch (error) {
      this.logService.error('❌ Falha ao conectar ao MongoDB Atlas!', {}, error as Error);
      this.mongoClient = null;
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Fechar conexão de forma síncrona (para process.on('exit'))
   */
  #closeSync() {
    if (this.mongoClient) {
      try {
        this.logService.info('🔌 Fechando conexão síncrona com o MongoDB...');
        // Não é async, apenas marca para fechar
        this.mongoClient = null;
      } catch (error) {
        this.logService.error('⚠️ Erro ao fechar conexão síncrona:', {}, error as Error);
      }
    }
  }

  async closeConnection(): Promise<void> {
    if (this.mongoClient) {
      try {
        await this.mongoClient.close();
        this.logService.info('✅ Conexão com MongoDB fechada.');
        this.mongoClient = null;
      } catch (error) {
        this.logService.error('⚠️ Erro ao fechar conexão com MongoDB:', {}, error as Error);
        this.mongoClient = null;
      }
    }
  }

  async saveData(collectionName: string, data: Record<string, unknown>): Promise<ResultType> {
    this.logService.info(`💾 Iniciando salvamento de dados na collection ${collectionName}...`);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      this.logService.error('‼️ Parâmetro data deve ser um objeto');
      throw new Error('Parâmetro data deve ser um objeto');
    }

    const client = await this.#getConnection();

    const db = client.db(this.mongoDBConfig.database);
    const collection = db.collection(collectionName);

    try {
      const result = await collection.insertOne(data);
      this.logService.info(`✅ Dados salvos com sucesso na collection ${collectionName}!`);
      return {
        data: { _id: result.insertedId, ...data },
        currentPage: 1,
        totalPages: 1,
        totalDocuments: 1,
        hasNextPage: false,
        hasPrevPage: false,
        limit: 1,
      };
    } catch (error) {
      this.logService.error(
        `❌ Erro ao salvar dados na collection ${collectionName}!`,
        {},
        error as Error
      );
      throw error;
    }
  }

  async getData(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tableName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    hashKey: { name: string; type: string; value: string },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sortKey?: { name: string; type: string; value: string } | undefined
  ): Promise<ResultType> {
    this.logService.warn(
      `📡 Chamada ao método getData (não implementado) para a collection ${tableName}...`
    );
    throw new Error('Method not implemented.');
  }

  async queryData(tableName: string, params: KeyValueAttr[]): Promise<ResultType> {
    this.logService.info(`📡 Iniciando queryData na collection ${tableName}...`);
    if (params.length === 0) {
      this.logService.error('‼️ Parâmetros de consulta não definidos');
      throw new Error('Parâmetros de consulta não definidos');
    }

    if (params.some((p) => p.attribute.AttributeName?.toLowerCase() === 'id')) {
      const result: ResultType = await this.findByMinhotecaId(
        tableName,
        params.find((p) => p.attribute.AttributeName?.toLowerCase() === 'id')!.attributeValue
      );
      return result;
    }

    if (params.length === 1) {
      const result: ResultType = await this.filterByField(
        tableName,
        params[0].attribute.AttributeName || '',
        params[0].attributeValue
      );
      return result;
    }

    const query: Record<string, unknown> = {};
    params.forEach((param) => {
      query[param.attribute.AttributeName || ''] = param.attributeValue;
    });

    const result: ResultType = await this.select(tableName, query);
    return result;
  }

  async removeData(
    tableName: string,
    attributes: KeyValueAttr[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    partKeyName?: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sortKeyName?: string
  ): Promise<ResultType> {
    this.logService.info(`🗑️ Iniciando remoção múltipla de dados na collection ${tableName}...`, {
      attributes,
    });
    const client = await this.#getConnection();

    const db = client.db(this.mongoDBConfig.database);
    const collection = db.collection(tableName);
    try {
      const query = attributes.reduce((acc: Record<string, unknown>, attr) => {
        if (attr?.attribute?.AttributeName) {
          acc[attr.attribute.AttributeName] = attr.attributeValue;
        }
        return acc;
      }, {});

      // Previne a deleção de tudo caso a query dinâmica seja um objeto vazio {}
      if (Object.keys(query).length === 0) {
        this.logService.error('‼️ Parâmetros inválidos ou vazios fornecidos para exclusão.');
        throw new Error('Parâmetros inválidos ou vazios fornecidos para exclusão.');
      }

      // Usamos deleteMany para honrar filtros que possam retornar mais de um documento
      const result = await collection.deleteMany(query);

      this.logService.info(`✅ Dados removidos com sucesso da collection ${tableName}!`, {
        deletedCount: result.deletedCount,
      });
      return {
        data: { deletedCount: result.deletedCount },
        currentPage: 1,
        totalPages: 1,
        totalDocuments: result.deletedCount,
        hasNextPage: false,
        hasPrevPage: false,
        limit: result.deletedCount,
      };
    } catch (error) {
      this.logService.error(
        `❌ Erro ao remover dados da collection ${tableName}!`,
        {},
        error as Error
      );
      throw error;
    }
  }

  async updateByMinhotecaId(
    collectionName: string,
    data: Record<string, unknown>,
    id: string
  ): Promise<ResultType> {
    this.logService.info(
      `🔄 Iniciando atualização por ID (${id}) na collection ${collectionName}...`
    );
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      this.logService.error('‼️ Parâmetro data deve ser um objeto com campos a serem atualizados');
      throw new Error('Parâmetro data deve ser um objeto com campos a serem atualizados');
    }

    const client = await this.#getConnection();

    const db = client.db(this.mongoDBConfig.database);
    const collection = db.collection(collectionName);

    try {
      const result = await collection.findOneAndUpdate(
        { id },
        { $set: data },
        { returnDocument: 'after' }
      );
      this.logService.info(`✅ Dados atualizados com sucesso na collection ${collectionName}!`);
      return {
        data: result,
        currentPage: 1,
        totalPages: 1,
        totalDocuments: result ? 1 : 0,
        hasNextPage: false,
        hasPrevPage: false,
        limit: result ? 1 : 0,
      };
    } catch (error) {
      this.logService.error(
        `❌ Erro ao atualizar dados na collection ${collectionName}!`,
        {},
        error as Error
      );
      throw error;
    }
  }

  async findByMinhotecaId(collectionName: string, id: string): Promise<ResultType> {
    const client = await this.#getConnection();

    const db = client.db(this.mongoDBConfig.database);
    const collection = db.collection(collectionName);
    this.logService.info(`🔍 Buscando documento pelo ID ${id} na collection ${collectionName}...`);

    try {
      const result = await collection.findOne({ id });
      this.logService.info(
        `✅ Documento recuperado com sucesso da collection ${collectionName}!`,
        {
          encontrado: !!result,
        },
        {
          result,
        }
      );
      return {
        data: result,
        currentPage: 1,
        totalPages: 1,
        totalDocuments: result ? 1 : 0,
        hasNextPage: false,
        hasPrevPage: false,
        limit: result ? 1 : 0,
      };
    } catch (error) {
      this.logService.error(
        `❌ Erro ao buscar documento na collection ${collectionName}!`,
        {
          id,
        },
        error as Error
      );
      throw error;
    }
  }

  async getAll(tableName: string, options: GetAllOptions = {}): Promise<ResultType> {
    const client = await this.#getConnection();
    this.logService.info(`📡 Consulta (getAll) solicitada na collection ${tableName} com opções:`, {
      options,
    });

    const db = client.db(this.mongoDBConfig.database);

    const collection = db.collection(tableName);

    try {
      const { sortBy, filterKey, filterValue } = options;
      // Conversão defensiva para garantir que o MongoDB driver receba números estritos
      const page = Number(options.page ?? 0);
      const limit = Number(options.limit ?? 0);
      const sortOrder = options.sortOrder ?? 0;
      const skip = page > 0 ? (page - 1) * limit : 0;
      const hasScalarFilterValue =
        filterValue !== undefined && filterValue !== null && `${filterValue}` !== '';
      const hasArrayFilterValue = Array.isArray(filterValue) && filterValue.length > 0;
      const hasFilter = !!filterKey && (hasScalarFilterValue || hasArrayFilterValue);

      let filterQuery: Record<string, unknown> = {};
      if (hasFilter && filterKey) {
        if (Array.isArray(filterValue)) {
          filterQuery = { [filterKey]: { $in: filterValue } };
        } else {
          const escapedFilterValue = `${filterValue}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          filterQuery = { [filterKey]: { $regex: escapedFilterValue, $options: 'i' } };
        }
      }

      if (process.env.MONGODB_DEBUG_QUERY === 'true') {
        this.logService.info('[MongoDBRepository.getAll] filterQuery:', {
          filterQuery,
          options: {
            page,
            limit,
            sortBy,
            sortOrder,
            filterKey,
            filterValue,
          },
        });
      }

      let query = collection.find(filterQuery);

      // Aplicar ordenação se especificada
      if (sortBy) {
        let finalSortBy = sortBy;
        let finalSortOrder = sortOrder;

        // Proteção contra parâmetros invertidos (ex: sortBy='asc', sortOrder='titulo')
        const validDirections = ['1', '-1', 'asc', 'desc', 'ascending', 'descending'];
        if (
          !validDirections.includes(String(finalSortOrder).toLowerCase()) &&
          validDirections.includes(String(finalSortBy).toLowerCase())
        ) {
          finalSortBy = String(sortOrder);
          finalSortOrder = sortBy;
        }

        // Normalizar direção para 1 ou -1, como exigido pelo driver do MongoDB
        let direction: 1 | -1 = 1;
        const dirStr = String(finalSortOrder).toLowerCase();
        if (dirStr === '-1' || dirStr === 'desc' || dirStr === 'descending') {
          direction = -1;
        }

        const sort: Record<string, 1 | -1> = {};
        sort[String(finalSortBy)] = direction;
        // Usa collation para ordenar ignorando acentuação (ex.: A = Á) e caixa
        query = query.sort(sort).collation({
          locale: process.env.MONGODB_SORT_LOCALE || 'pt',
          strength: 1,
        });
      }

      // Aplicar paginação
      if (limit > 0 && page > 0) {
        query = query.skip(skip).limit(limit);
      }

      const results = await query.toArray();

      // Obter total de documentos para metadados de paginação
      const totalDocuments = (await collection.countDocuments(filterQuery)) || 0;
      const totalPages = limit > 0 ? Math.ceil(totalDocuments / limit) : 1;

      this.logService.info(
        `✅ Consulta (getAll) realizada com sucesso em ${tableName}. Foram retornados ${results.length} documento(s).`
      );
      return {
        data: results,
        currentPage: page,
        totalPages,
        totalDocuments,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit,
      };
    } catch (error) {
      this.logService.error(
        `❌ Erro ao buscar todos os dados (getAll) na collection ${tableName}!`,
        {},
        error as Error
      );
      throw error;
    }
  }

  async filterByField(collectionName: string, field: string, value: unknown): Promise<ResultType> {
    this.logService.info(
      `📡 Iniciando filtro pelo campo ${field} na collection ${collectionName}...`,
      { value }
    );
    const client = await this.#getConnection();

    const db = client.db(this.mongoDBConfig.database);
    const collection = db.collection(collectionName);

    try {
      const results = await collection.find({ [field]: value }).toArray();
      this.logService.info(
        `✅ Dados filtrados com sucesso pelo campo ${field} na collection ${collectionName}!`,
        { resultCount: results.length }
      );
      return {
        data: results,
        currentPage: 1,
        totalPages: 1,
        totalDocuments: results.length,
        hasNextPage: false,
        hasPrevPage: false,
        limit: results.length,
      };
    } catch (error) {
      this.logService.error(
        `❌ Erro ao filtrar dados pelo campo ${field} na collection ${collectionName}!`,
        {},
        error as Error
      );
      throw error;
    }
  }

  async select(
    collectionName: string,
    query: Record<string, unknown> = {},
    options: { sortBy?: string; sortOrder?: string | number; projection?: unknown } = {}
  ): Promise<ResultType> {
    this.logService.info(`📡 Iniciando select na collection ${collectionName}...`, { query });
    const client = await this.#getConnection();

    const db = client.db(this.mongoDBConfig.database);
    const collection = db.collection(collectionName);

    try {
      const { sortBy, sortOrder = 1, projection } = options;

      // Configurar projeção se especificada
      const findOptions: { projection?: Record<string, number> } = {};
      if (projection) {
        if (Array.isArray(projection)) {
          // Se for array, converter para objeto com valores 1
          findOptions.projection = {};
          projection.forEach((field) => {
            findOptions.projection![String(field)] = 1;
          });
        } else if (typeof projection === 'object' && projection !== null) {
          // Se for objeto, usar diretamente
          findOptions.projection = projection as Record<string, number>;
        }
      }

      let cursor = collection.find(query, findOptions);

      // Aplicar ordenação se especificada
      if (sortBy) {
        let finalSortBy = sortBy;
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

        const sort: Record<string, 1 | -1> = {};
        sort[String(finalSortBy)] = direction;
        cursor = cursor.sort(sort).collation({
          locale: process.env.MONGODB_SORT_LOCALE || 'pt',
          strength: 1,
        });
      }

      const results = await cursor.toArray();

      // Obter total de documentos para metadados de paginação
      const totalDocuments = (await collection.countDocuments(query)) || 0;

      this.logService.info(`✅ Dados selecionados com sucesso na collection ${collectionName}!`, {
        resultCount: results.length,
      });

      return {
        data: results,
        currentPage: 1,
        totalPages: 1,
        totalDocuments,
        hasNextPage: false,
        hasPrevPage: false,
        limit: results?.length || 0,
      };
    } catch (error) {
      this.logService.error(
        `❌ Erro ao selecionar dados na collection ${collectionName}!`,
        {},
        error as Error
      );
      throw error;
    }
  }

  async findWithProjection(
    collectionName: string,
    query: Record<string, unknown> = {},
    projection: unknown = {},
    options: { page?: number; limit?: number; sortBy?: string; sortOrder?: string | number } = {}
  ): Promise<ResultType> {
    this.logService.info(`🔍 Iniciando busca com projeção na collection ${collectionName}...`, {
      query,
      options,
    });
    const client = await this.#getConnection();

    const db = client.db(this.mongoDBConfig.database);
    const collection = db.collection(collectionName);

    try {
      const { page = 1, limit = 10, sortBy, sortOrder = 1 } = options;
      const skip = (page - 1) * limit;

      // Configurar projeção
      const findOptions: { projection?: Record<string, number> } = {};
      if (projection) {
        if (Array.isArray(projection)) {
          // Se for array, converter para objeto com valores 1
          findOptions.projection = {};
          projection.forEach((field) => {
            findOptions.projection![String(field)] = 1;
          });
        } else if (typeof projection === 'object' && projection !== null) {
          // Se for objeto, usar diretamente
          findOptions.projection = projection as Record<string, number>;
        }
      }

      let cursor = collection.find(query, findOptions);

      // Aplicar ordenação se especificada
      if (sortBy) {
        let finalSortBy = sortBy;
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

        const sort: Record<string, 1 | -1> = {};
        sort[String(finalSortBy)] = direction;
        cursor = cursor.sort(sort).collation({
          locale: process.env.MONGODB_SORT_LOCALE || 'pt',
          strength: 1,
        });
      }

      // Aplicar paginação
      if (limit > 0) {
        cursor = cursor.skip(skip).limit(limit);
      }

      const results = await cursor.toArray();

      // Obter total de documentos para metadados de paginação
      const totalDocuments = (await collection.countDocuments(query)) || 0;
      const totalPages = limit > 0 ? Math.ceil(totalDocuments / limit) : 1;

      this.logService.info(
        `✅ Busca com projeção realizada com sucesso na collection ${collectionName}! Página: ${page}, Limite: ${limit}`
      );

      return {
        data: results,
        currentPage: page,
        totalPages,
        totalDocuments,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit,
      };
    } catch (error) {
      this.logService.error(
        `❌ Erro ao realizar busca com projeção na collection ${collectionName}!`,
        {},
        error as Error
      );
      throw error;
    }
  }

  async deleteByMinhotecaId(collectionName: string, id: string): Promise<ResultType> {
    const client = await this.#getConnection();

    const db = client.db(this.mongoDBConfig.database);
    const collection = db.collection(collectionName);

    try {
      this.logService.info(
        `🗑️ Iniciando remoção de documento por ID (${id}) na collection ${collectionName}...`
      );

      // findOneAndDelete deleta e retorna o documento removido
      const result = await collection.findOneAndDelete({ id });

      if (!result) {
        this.logService.warn(
          `⚠️ Nenhum documento encontrado com ID ${id} para remoção na collection ${collectionName}`
        );
        return {
          data: null,
          currentPage: 0,
          totalPages: 0,
          totalDocuments: 0,
          hasNextPage: false,
          hasPrevPage: false,
          limit: 0,
        };
      }

      this.logService.info(
        `✅ Documento com ID ${id} removido com sucesso da collection ${collectionName}!`
      );
      return {
        data: [result],
        currentPage: 1,
        totalPages: 1,
        totalDocuments: 1,
        hasNextPage: false,
        hasPrevPage: false,
        limit: 0,
      };
    } catch (error) {
      this.logService.error(
        `❌ Erro ao remover documento por ID na collection ${collectionName}:`,
        {},
        error as Error
      );
      throw error;
    }
  }

  async getListByMinhotecaIds(collectionName: string, ids: string[]): Promise<ResultType> {
    const client = await this.#getConnection();

    const db = client.db(this.mongoDBConfig.database);
    const collection = db.collection(collectionName);

    try {
      this.logService.info(
        `🔍 Iniciando busca de documentos por IDs na collection ${collectionName}...`,
        { ids }
      );

      const results = await collection.find({ id: { $in: ids } }).toArray();

      this.logService.info(
        `✅ Busca de documentos por IDs realizada com sucesso na collection ${collectionName}!`,
        { foundCount: results.length }
      );

      return {
        data: results,
        currentPage: 1,
        totalPages: 1,
        totalDocuments: results.length,
        hasNextPage: false,
        hasPrevPage: false,
        limit: results.length,
      };
    } catch (error) {
      this.logService.error(
        `❌ Erro ao buscar documentos por IDs na collection ${collectionName}:`,
        {},
        error as Error
      );
      throw error;
    }
  }
}
