import { MongoClient } from 'mongodb';
import { KeyValueAttr, RepositoryInterface } from '../interfaces';
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
    console.log('✅ MongoDB configuration loaded from centralized config');

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
      console.error('❌ Missing required environment variables:');
      missingVars.forEach((varName) => {
        console.error(`  - ${varName}`);
      });
      console.error('\nPlease create a .env file based on .env.example');
      process.exit(1);
    }

    console.log('✅ Environment variables validated successfully');
  }

  get mongodb() {
    const isAtlas = process.env.MONGODB_CLUSTER?.includes('mongodb.net');
    const uri = isAtlas
      ? `mongodb+srv://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_CLUSTER}/?retryWrites=true&w=majority&appName=${process.env.MONGODB_APPNAME}`
      : `mongodb://${process.env.MONGODB_USERNAME}:${process.env.MONGODB_PASSWORD}@${process.env.MONGODB_CLUSTER}/?retryWrites=true&w=majority&appName=${process.env.MONGODB_APPNAME}`;
    console.log('Constructed MongoDB URI:', uri);
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
      console.log(
        `⏳ Esperando conexão em andamento... (tentativa ${retries + 1}/${this.MAX_RETRIES})`
      );
      await new Promise((resolve) => setTimeout(resolve, this.RETRY_DELAY));
      retries++;
    }

    // Se cliente está ativo, reutiliza (sem verificar saúde sempre)
    if (this.mongoClient) {
      console.log('♻️ Reutilizando conexão MongoDB existente');

      // Verifica saúde RARAMENTE para evitar race condition
      if (!this.isHealthChecking) {
        this.isHealthChecking = true;
        try {
          console.log('🔍 Verificando saúde da conexão MongoDB...');
          await this.mongoClient.db('admin').command({ ping: 1 });
          console.log('✅ Conexão MongoDB está viva');
        } catch (error) {
          console.warn('⚠️ MongoDB client is not responding, resetting...', error);
          this.mongoClient = null;
        } finally {
          this.isHealthChecking = false;
        }
      }
    }

    // Se não tem cliente após health check, conecta
    if (!this.mongoClient) {
      console.log('📡 Nenhuma conexão ativa, conectando...');
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

      console.log('🔗 Connecting to MongoDB Atlas cluster...');
      await mongoClient.connect();
      console.log('✅ Successfully connected to MongoDB Atlas!');

      return mongoClient;
    } catch (error) {
      console.error('❌ Connection to MongoDB Atlas failed!', error);
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
        console.log('🔌 Closing MongoDB connection...');
        // Não é async, apenas marca para fechar
        this.mongoClient = null;
      } catch (error) {
        console.error('⚠️ Error on sync close:', error);
      }
    }
  }

  async closeConnection() {
    if (this.mongoClient) {
      try {
        await this.mongoClient.close();
        console.log('✅ MongoDB connection closed.');
        this.mongoClient = null;
      } catch (error) {
        console.error('⚠️ Error closing MongoDB connection:', error);
        this.mongoClient = null;
      }
    }
  }

  async saveData(collectionName: string, data: any): Promise<ResultType> {
    const client = await this.#getConnection();

    const db = client.db(this.mongoDBConfig.database);
    const collection = db.collection(collectionName);

    try {
      const result = await collection.insertOne(data);
      console.log(`✅ Dsdos salvos com sucesso em ${collectionName} collection!`);
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
      console.error(`❌ Failed to save data in ${collectionName} collection!`, error);
      throw error;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getData<T>(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    tableName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    hashKey: { name: string; type: string; value: string },
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sortKey?: { name: string; type: string; value: string } | undefined
  ): Promise<ResultType> {
    throw new Error('Method not implemented.');
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async queryData<T>(tableName: string, params: KeyValueAttr[]): Promise<ResultType> {
    if (params.length === 0) {
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
    const client = await this.#getConnection();

    const db = client.db(this.mongoDBConfig.database);
    const collection = db.collection(tableName);
    try {
      const query = attributes.reduce((acc: Record<string, any>, attr) => {
        if (attr?.attribute?.AttributeName) {
          acc[attr.attribute.AttributeName] = attr.attributeValue;
        }
        return acc;
      }, {});

      // Previne a deleção de tudo caso a query dinâmica seja um objeto vazio {}
      if (Object.keys(query).length === 0) {
        throw new Error('Parâmetros inválidos ou vazios fornecidos para exclusão.');
      }

      // Usamos deleteMany para honrar filtros que possam retornar mais de um documento
      const result = await collection.deleteMany(query);

      console.log(`✅ Data removed successfully from ${tableName} collection!`);
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
      console.error(`❌ Failed to remove data from ${tableName} collection!`, error);
      throw error;
    }
  }

  async updateByMinhotecaId(collectionName: string, data: any, id: string): Promise<ResultType> {
    const client = await this.#getConnection();

    const db = client.db(this.mongoDBConfig.database);
    const collection = db.collection(collectionName);

    try {
      const result = await collection.findOneAndUpdate(
        { id },
        { $set: data },
        { returnDocument: 'after' }
      );
      console.log('**********************', { result });
      console.log(`✅ Data updated successfully in ${collectionName} collection!`);
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
      console.error(`❌ Failed to update data in ${collectionName} collection!`, error);
      throw error;
    }
  }

  async findByMinhotecaId(collectionName: string, id: string): Promise<ResultType> {
    const client = await this.#getConnection();

    const db = client.db(this.mongoDBConfig.database);
    const collection = db.collection(collectionName);
    console.log(
      `🔍 Será realizada busca de documento pelo ID ${id} em ${collectionName} collection...`
    );

    try {
      const result = await collection.findOne({ id });
      console.log(`✅ Data retrieved successfully from ${collectionName} collection!)`, { result });
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
      console.error(`❌ Failed to retrieve data from ${collectionName} collection!`, error);
      throw error;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getAll<T>(tableName: string, options: unknown = {}): Promise<ResultType> {
    const client = await this.#getConnection();
    console.log('Consulta solicitada para getAll com opções:', options);

    const db = client.db(this.mongoDBConfig.database);

    const collection = db.collection(tableName);

    try {
      const sortBy = Object.getOwnPropertyDescriptor(options, 'sortBy')?.value;
      const filterKey = Object.getOwnPropertyDescriptor(options, 'filterKey')?.value;
      const filterValue = Object.getOwnPropertyDescriptor(options, 'filterValue')?.value;
      // Conversão defensiva para garantir que o MongoDB driver receba números estritos
      const page = Number(Object.getOwnPropertyDescriptor(options, 'page')?.value ?? 0);
      const limit = Number(Object.getOwnPropertyDescriptor(options, 'limit')?.value ?? 0);
      const sortOrder = Number(Object.getOwnPropertyDescriptor(options, 'sortOrder')?.value ?? 0);
      const skip = page > 0 ? (page - 1) * limit : 0;
      const hasFilter =
        !!filterKey && filterValue !== undefined && filterValue !== null && `${filterValue}` !== '';
      const escapedFilterValue = hasFilter
        ? `${filterValue}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        : '';
      const filterQuery = hasFilter
        ? { [filterKey]: { $regex: escapedFilterValue, $options: 'i' } }
        : {};

      if (process.env.MONGODB_DEBUG_QUERY === 'true') {
        console.log('[MongoDBRepository.getAll] filterQuery:', JSON.stringify(filterQuery));
        console.log('[MongoDBRepository.getAll] options:', {
          page,
          limit,
          sortBy,
          sortOrder,
          filterKey,
          filterValue,
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
          finalSortBy = sortOrder;
          finalSortOrder = sortBy;
        }

        // Normalizar direção para 1 ou -1, como exigido pelo driver do MongoDB
        let direction = 1;
        const dirStr = String(finalSortOrder).toLowerCase();
        if (dirStr === '-1' || dirStr === 'desc' || dirStr === 'descending') {
          direction = -1;
        }

        const sort: any = {};
        sort[finalSortBy] = direction;
        query = query.sort(sort);
      }

      // Aplicar paginação
      if (limit > 0 && page > 0) {
        query = query.skip(skip).limit(limit);
      }

      const results = await query.toArray();

      // Obter total de documentos para metadados de paginação
      const totalDocuments = (await collection.countDocuments(filterQuery)) || 0;
      const totalPages = limit > 0 ? Math.ceil(totalDocuments / limit) : 1;

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
      console.error(`❌ Failed to retrieve all data from ${tableName} collection!`, error);
      throw error;
    }
  }

  async filterByField(collectionName: string, field: string, value: any): Promise<ResultType> {
    const client = await this.#getConnection();

    const db = client.db(this.mongoDBConfig.database);
    const collection = db.collection(collectionName);

    try {
      const results = await collection.find({ [field]: value }).toArray();
      console.log(`✅ Data filtered by ${field} successfully from ${collectionName} collection!`);
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
      console.error(`❌ Failed to filter data by ${field} in ${collectionName} collection!`, error);
      throw error;
    }
  }

  async select(collectionName: string, query = {}, options: any = {}): Promise<ResultType> {
    const client = await this.#getConnection();

    const db = client.db(this.mongoDBConfig.database);
    const collection = db.collection(collectionName);

    try {
      const { sortBy, sortOrder = 1, projection } = options;

      // Configurar projeção se especificada
      let findOptions: any = {};
      if (projection) {
        if (Array.isArray(projection)) {
          // Se for array, converter para objeto com valores 1
          findOptions.projection = {};
          projection.forEach((field) => {
            findOptions.projection[field] = 1;
          });
        } else if (typeof projection === 'object') {
          // Se for objeto, usar diretamente
          findOptions.projection = projection;
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
          finalSortBy = sortOrder;
          finalSortOrder = sortBy;
        }

        let direction = 1;
        const dirStr = String(finalSortOrder).toLowerCase();
        if (dirStr === '-1' || dirStr === 'desc' || dirStr === 'descending') {
          direction = -1;
        }

        const sort: any = {};
        sort[finalSortBy] = direction;
        cursor = cursor.sort(sort);
      }

      const results = await cursor.toArray();

      // Obter total de documentos para metadados de paginação
      const totalDocuments = (await collection.countDocuments(query)) || 0;

      console.log(`✅ Data selected successfully from ${collectionName} collection!`);

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
      console.error(`❌ Failed to select data from ${collectionName} collection!`, error);
      throw error;
    }
  }

  async findWithProjection(
    collectionName: string,
    query = {},
    projection = {},
    options: any = {}
  ): Promise<ResultType> {
    const client = await this.#getConnection();

    const db = client.db(this.mongoDBConfig.database);
    const collection = db.collection(collectionName);

    try {
      const { page = 1, limit = 10, sortBy, sortOrder = 1 } = options;
      const skip = (page - 1) * limit;

      // Configurar projeção
      let findOptions: any = {};
      if (projection) {
        if (Array.isArray(projection)) {
          // Se for array, converter para objeto com valores 1
          findOptions.projection = {};
          projection.forEach((field) => {
            findOptions.projection[field] = 1;
          });
        } else if (typeof projection === 'object') {
          // Se for objeto, usar diretamente
          findOptions.projection = projection;
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
          finalSortBy = sortOrder;
          finalSortOrder = sortBy;
        }

        let direction = 1;
        const dirStr = String(finalSortOrder).toLowerCase();
        if (dirStr === '-1' || dirStr === 'desc' || dirStr === 'descending') {
          direction = -1;
        }

        const sort: any = {};
        sort[finalSortBy] = direction;
        cursor = cursor.sort(sort);
      }

      // Aplicar paginação
      if (limit > 0) {
        cursor = cursor.skip(skip).limit(limit);
      }

      const results = await cursor.toArray();

      // Obter total de documentos para metadados de paginação
      const totalDocuments = (await collection.countDocuments(query)) || 0;
      const totalPages = limit > 0 ? Math.ceil(totalDocuments / limit) : 1;

      console.log(
        `✅ Data retrieved with projection successfully from ${collectionName} collection! Page: ${page}, Limit: ${limit}`
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
      console.error(
        `❌ Failed to retrieve data with projection from ${collectionName} collection!`,
        error
      );
      throw error;
    }
  }

  async deleteByMinhotecaId(collectionName: string, id: string): Promise<ResultType> {
    const client = await this.#getConnection();

    const db = client.db(this.mongoDBConfig.database);
    const collection = db.collection(collectionName);

    try {
      console.log('🚩 Atributos de consulta para deleteByMinhotecaId:', { id });

      // findOneAndDelete deleta e retorna o documento removido
      const result = await collection.findOneAndDelete({ id });

      if (!result) {
        console.log(`⚠️ No document found with id: ${id} in ${collectionName} collection`);
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

      console.log(
        `✅ Document with id ${id} deleted successfully from ${collectionName} collection!`
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
      console.error(`❌ Error deleting document by id from ${collectionName}:`, error);
      throw error;
    }
  }
}
