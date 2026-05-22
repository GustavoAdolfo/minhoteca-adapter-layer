export type ResultType = {
  data: any | any[] | null;
  currentPage: number;
  totalPages: number;
  totalDocuments: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  limit: number;
};
