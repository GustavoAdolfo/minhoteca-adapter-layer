import { config as dotenvConfig } from 'dotenv';

// Carrega envs de teste (ajuste o path conforme seu projeto)
dotenvConfig({ path: 'src/__tests__/.env.test' });

// Defaults para testes locais (evitam provider chain)
process.env.NODE_ENV = 'test';
process.env.AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID ?? 'test';
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? 'test';

// Desabilita fontes dinâmicas de credencial
delete process.env.AWS_PROFILE;
process.env.AWS_SDK_LOAD_CONFIG = '0';
process.env.AWS_EC2_METADATA_DISABLED = 'true';

// Configura Jest para testes de integração com DynamoDB

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';

const dynamoEndpoint = 'http://localhost:4566';
const tableName = process.env.TEST_TABLE_NAME ?? 'MinhotecaTestTable';

const dynamo = new DynamoDBClient({
  region: process.env.AWS_REGION,
  endpoint: dynamoEndpoint,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? 'test',
  },
});

beforeAll(async () => {
  const tableExists = await dynamo
    .send(new DescribeTableCommand({ TableName: tableName }))
    .then(() => true)
    .catch((error) => {
      if (error?.name === 'ResourceNotFoundException') {
        return false;
      }
      throw error;
    });

  if (!tableExists) {
    await dynamo.send(
      new CreateTableCommand({
        TableName: tableName,
        AttributeDefinitions: [
          { AttributeName: 'id', AttributeType: 'S' },
          { AttributeName: 'name', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'id', KeyType: 'HASH' },
          { AttributeName: 'name', KeyType: 'RANGE' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      })
    );

    await waitUntilTableExists({ client: dynamo, maxWaitTime: 30 }, { TableName: tableName });
  }
});

// afterAll(async () => {
//   await dynamo.send(new DeleteTableCommand({ TableName: tableName }));
//   await waitUntilTableNotExists({ client: dynamo, maxWaitTime: 30 }, { TableName: tableName });
// });
