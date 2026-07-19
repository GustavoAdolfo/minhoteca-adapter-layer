import { KeyValueAttr } from './dynamodb-attributes.interface';
import { ResultType } from './result.type';

export type SortOrderOption = 1 | -1 | '1' | '-1' | 'asc' | 'desc' | 'ascending' | 'descending';

export interface GetAllOptions {
  sortBy?: string;
  sortOrder?: SortOrderOption | string | number;
  filterKey?: string;
  filterValue?: string | number | boolean | string[] | number[];
  page?: number;
  limit?: number;
}

export interface RepositoryInterface {
  saveData(tableName: string, data: Record<string, unknown>): Promise<ResultType>;
  getData(
    tableName: string,
    hashKey: { name: string; type: string; value: string },
    sortKey?: { name: string; type: string; value: string } | undefined
  ): Promise<ResultType>;
  queryData(tableName: string, params: KeyValueAttr[]): Promise<ResultType>;
  removeData(
    tableName: string,
    attributes: KeyValueAttr[],
    partKeyName?: string,
    sortKeyName?: string
  ): Promise<ResultType>;
  getAll(tableName: string, options?: GetAllOptions): Promise<ResultType>;
  updateByMinhotecaId(
    tableName: string,
    data: Record<string, unknown>,
    id: string
  ): Promise<ResultType>;
  deleteByMinhotecaId(collectionName: string, id: string): Promise<ResultType>;
  findByMinhotecaId(collectionName: string, id: string): Promise<ResultType>;
  getListByMinhotecaIds(collectionName: string, ids: string[]): Promise<ResultType>;
}
