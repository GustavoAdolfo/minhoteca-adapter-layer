import { createClient, SERVICE_TYPE } from '../../../layer/nodejs/src/factories/aws-client.factory';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LogService } from '@gustavoadolfo/minhoteca-core-layer';

// Mocks das dependências externas
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@gustavoadolfo/minhoteca-core-layer', () => {
  const mockError = jest.fn();
  const MockLogService = jest.fn().mockImplementation(() => ({
    error: mockError,
  }));
  // Atrela a função mockada à classe para evitar erro de inicialização (ReferenceError/TDZ)
  (MockLogService as any)._mockError = mockError;
  return { LogService: MockLogService };
});

const mockLogError = (LogService as any)._mockError;

describe('AWS Client Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Limpa o histórico de todos os mocks antes de cada teste
    jest.clearAllMocks();

    // Reseta as variáveis de ambiente
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restaura as variáveis de ambiente após finalizar a suíte de testes
    process.env = originalEnv;
  });

  it('deve criar e retornar um DynamoDBClient com as configurações padrão', () => {
    const client = createClient(SERVICE_TYPE.DYNAMODB);

    expect(client).toBeDefined();
    expect(DynamoDBClient).toHaveBeenCalledTimes(1);
    expect(S3Client).not.toHaveBeenCalled();
  });

  it('deve criar e retornar um S3Client com as configurações padrão', () => {
    const client = createClient(SERVICE_TYPE.S3);

    expect(client).toBeDefined();
    expect(S3Client).toHaveBeenCalledTimes(1);
    expect(DynamoDBClient).not.toHaveBeenCalled();
  });

  it('deve criar um S3Client com configurações adaptadas para ambiente local caso ENDPOINT_LOCAL_S3 seja definido', () => {
    process.env.ENDPOINT_LOCAL_S3 = 'http://localhost:4566';

    createClient(SERVICE_TYPE.S3);

    expect(S3Client).toHaveBeenCalledTimes(1);

    // Pega os argumentos que foram passados na instanciação do S3Client
    const s3ConstructorArgs = (S3Client as jest.Mock).mock.calls[0][0];

    expect(s3ConstructorArgs).toMatchObject({
      endpoint: 'http://localhost:4566',
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  });

  it('deve retornar null se um serviço desconhecido for passado', () => {
    const client = createClient('UNKNOWN_SERVICE' as SERVICE_TYPE);

    expect(client).toBeNull();
    expect(DynamoDBClient).not.toHaveBeenCalled();
    expect(S3Client).not.toHaveBeenCalled();
  });

  it('deve capturar exceções, registrar no log e retornar null se houver falha na criação', () => {
    const mockError = new Error('Erro forçado de teste na criação');

    // Força o construtor a disparar um erro
    (DynamoDBClient as jest.Mock).mockImplementationOnce(() => {
      throw mockError;
    });

    const client = createClient(SERVICE_TYPE.DYNAMODB);

    // Verifica se a Factory absorveu o erro e retornou null
    expect(client).toBeNull();

    // Checa a chamada do método error() no mock explícito
    expect(mockLogError).toHaveBeenCalledWith('Erro ao criar um cliente aws', {
      label: 'createClient',
      service: SERVICE_TYPE.DYNAMODB,
      error: mockError,
    });
  });

  it('deve criar um cliente DynamoDB utilizando os valores DEFAULT_REGION, DEFAULT_MAX_ATTEMPTS e a variável de ambiente ENDPOINT', () => {
    delete process.env.AWS_REGION;
    delete process.env.MAX_ATTEMPTS;
    process.env.ENDPOINT = 'http://localhost:4566';

    createClient(SERVICE_TYPE.DYNAMODB);

    expect(DynamoDBClient).toHaveBeenCalledTimes(1);

    // Pega os argumentos que foram passados na instanciação do DynamoDBClient
    const dynamoConstructorArgs = (DynamoDBClient as jest.Mock).mock.calls[0][0];

    expect(dynamoConstructorArgs).toMatchObject({
      region: 'us-east-1',
      maxAttempts: 5,
      endpoint: 'http://localhost:4566',
    });
  });
});
