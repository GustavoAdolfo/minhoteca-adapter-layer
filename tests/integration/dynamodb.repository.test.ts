import { randomUUID } from 'node:crypto';
import { DynamoDBRepository } from '../../layer/nodejs/src/repositories/dynamodb.repository';
import { KeyValueAttr } from '../../layer/nodejs/src/interfaces/dynamodb-attributes.interface';

describe('DynamoDBRepository Integration Test', () => {
  let repository: DynamoDBRepository;

  beforeAll(() => {
    repository = new DynamoDBRepository();
  });

  afterAll(async () => {});

  it('should be defined', () => {
    expect(repository).toBeDefined();
  });

  it('should save data to DynamoDB', async () => {
    const tableName = process.env.TEST_TABLE_NAME ?? 'TestTable';
    const itemData = { id: `test-${Date.now()}`, name: 'Lorem Ipsum' };
    const result = await repository.saveData(tableName, itemData);
    expect(result.data).toBeDefined();
    expect(result.totalDocuments).toBe(1);
  });

  it('should retrieve saved data from DynamoDB', async () => {
    const tableName = process.env.TEST_TABLE_NAME ?? 'TestTable';
    const itemId = `test-id-${Date.now()}-${Math.random()}`;
    const name = 'Nisi voluptate nulla velit laboris nostrud laboris aliqua duis excepteur velit';
    await repository.saveData(tableName, { id: itemId, name });
    const result = await repository.getData(tableName, { name: 'id', type: 'S', value: itemId });
    expect(result.data).toMatchObject([{ id: itemId, name }]);
  });

  it('should handle invalid table name gracefully', async () => {
    const invalidTableName = '';
    const itemData = {
      id: randomUUID(),
      name: 'Dolore adipisicing quis reprehenderit ullamco cillum ut ullamco irure velit ut',
    };
    await expect(repository.saveData(invalidTableName, itemData)).rejects.toThrow();
  });

  it('should return empty data for non-existent item', async () => {
    const tableName = process.env.TEST_TABLE_NAME ?? 'TestTable';
    const nonExistentId = randomUUID();
    const result = await repository.getData(tableName, {
      name: 'id',
      type: 'S',
      value: nonExistentId,
    });
    expect(result.data).toHaveLength(0);
  });

  it('should delete an item from DynamoDB', async () => {
    const tableName = process.env.TEST_TABLE_NAME ?? 'TestTable';
    const itemId = randomUUID();
    await repository.saveData(tableName, {
      id: itemId,
      name: 'Officia labore enim voluptate dolor',
    });
    const attributes: KeyValueAttr[] = [
      {
        attribute: {
          AttributeName: 'id',
          AttributeType: 'S',
        },
        attributeValue: itemId,
        partitionKey: true,
        sortKey: false,
      },
    ];
    const result = await repository.removeData(tableName, attributes, 'id');
    expect(result.data).toHaveProperty('success', true);
    expect(result.totalDocuments).toBeGreaterThanOrEqual(1);
  });

  it('should retrieve data with filter from DynamoDB', async () => {
    const tableName = process.env.TEST_TABLE_NAME ?? 'TestTable';
    const commonName = 'Id elit duis minim minim adipisicing.';
    const itemId1 = randomUUID();
    await repository.saveData(tableName, { id: itemId1, name: commonName, age: 30 });

    const result = await repository.queryData(tableName, [
      {
        attribute: { AttributeName: 'name', AttributeType: 'S' },
        attributeValue: commonName,
        partitionKey: false,
        sortKey: false,
      },
    ]);
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    result.data.forEach((item: unknown) => {
      expect(item).toHaveProperty('name', commonName);
    });
  });

  it('should retrieve all data from DynamoDB', async () => {
    const tableName = process.env.TEST_TABLE_NAME ?? 'TestTable';
    const result = await repository.getAll<unknown>(tableName);
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('should find an item by id using findByMinhotecaId', async () => {
    const tableName = process.env.TEST_TABLE_NAME ?? 'TestTable';
    const itemId = randomUUID();
    await repository.saveData(tableName, { id: itemId, author: 'Machado de Assis' });

    const result = await repository.findByMinhotecaId(tableName, itemId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toHaveProperty('author', 'Machado de Assis');
  });

  it('should update an item using updateByMinhotecaId', async () => {
    const tableName = process.env.TEST_TABLE_NAME ?? 'TestTable';
    const itemId = randomUUID();
    await repository.saveData(tableName, { id: itemId, status: 'PENDING' });

    const result = await repository.updateByMinhotecaId(tableName, { status: 'COMPLETED' }, itemId);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toHaveProperty('status', 'COMPLETED');
  });

  it('should delete an item using deleteByMinhotecaId', async () => {
    const tableName = process.env.TEST_TABLE_NAME ?? 'TestTable';
    const itemId = randomUUID();
    await repository.saveData(tableName, { id: itemId, title: 'To Be Deleted' });

    const deleteResult = await repository.deleteByMinhotecaId(tableName, itemId);
    expect(deleteResult.data).toHaveLength(1); // Item deletado retorna no ALL_OLD

    const findResult = await repository.findByMinhotecaId(tableName, itemId);
    expect(findResult.data).toHaveLength(0);
  });
});
