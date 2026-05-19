import { KeyValueAttr } from './dynamodb-attributes.interface';
import { ResultType } from './result.type';

export interface RepositoryInterface {
  saveData(tableName: string, data: any): Promise<ResultType>;
  getData<T>(
    tableName: string,
    hashKey: { name: string; type: string; value: string },
    sortKey?: { name: string; type: string; value: string } | undefined
  ): Promise<ResultType>;
  queryData<T>(tableName: string, params: KeyValueAttr[]): Promise<ResultType>;
  removeData(
    tableName: string,
    attributes: KeyValueAttr[],
    partKeyName?: string,
    sortKeyName?: string
  ): Promise<ResultType>;
  getAll<T>(tableName: string, options?: any): Promise<ResultType>;
  updateByMinhotecaId(tableName: string, data: any, id: string): Promise<ResultType>;
  deleteByMinhotecaId(collectionName: string, id: string): Promise<ResultType>;
  findByMinhotecaId(collectionName: string, id: string): Promise<ResultType>;
}
