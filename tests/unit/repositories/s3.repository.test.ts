import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Repository } from '../../../layer/nodejs/src/repositories/s3.repository';
import { createClient, SERVICE_TYPE } from '../../../layer/nodejs/src/factories/aws-client.factory';

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');
jest.mock('../../../layer/nodejs/src/factories/aws-client.factory');

describe('S3Repository', () => {
  let repository: S3Repository;
  let mockSend: jest.Mock;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Prepara o mock do Client do S3
    mockSend = jest.fn();
    mockClient = {
      send: mockSend,
      config: {},
    };

    // Controla o retorno das injeções de dependência
    (createClient as jest.Mock).mockReturnValue(mockClient);
    (getSignedUrl as jest.Mock).mockResolvedValue('https://presigned-url.test');

    repository = new S3Repository();
  });

  describe('Constructor', () => {
    it('deve inicializar o client S3 usando a factory', () => {
      expect(createClient).toHaveBeenCalledWith(SERVICE_TYPE.S3);
      expect(repository.client).toBe(mockClient);
    });
  });

  describe('createPreSignedUrlPut', () => {
    it('deve gerar uma url pré-assinada para upload (PutObjectCommand)', async () => {
      const url = await repository.createPreSignedUrlPut('meu-bucket', 'arquivo.txt', 'text/plain');

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'meu-bucket',
        Key: 'arquivo.txt',
        ContentType: 'text/plain',
      });
      expect(getSignedUrl).toHaveBeenCalledWith(mockClient, expect.any(Object), {
        expiresIn: 3600,
      });
      expect(url).toBe('https://presigned-url.test');
    });

    it('deve aplicar forcePathStyle se parametro for true', async () => {
      await repository.createPreSignedUrlPut('meu-bucket', 'arquivo.txt', 'text/plain', true);
      expect(mockClient.config.forcePathStyle).toBe(true);
    });
  });

  describe('createPreSignedUrlGet', () => {
    it('deve gerar uma url pré-assinada para download (GetObjectCommand)', async () => {
      const url = await repository.createPreSignedUrlGet('meu-bucket', 'arquivo.txt', 'text/plain');

      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'meu-bucket',
        Key: 'arquivo.txt',
        ResponseContentType: 'text/plain',
      });
      expect(getSignedUrl).toHaveBeenCalledWith(mockClient, expect.any(Object), {
        expiresIn: 604800, // 7 dias
      });
      expect(url).toBe('https://presigned-url.test');
    });

    it('deve aplicar forcePathStyle se parametro for true', async () => {
      await repository.createPreSignedUrlGet('meu-bucket', 'arquivo.txt', 'text/plain', true);
      expect(mockClient.config.forcePathStyle).toBe(true);
    });
  });

  describe('getDataFromS3File', () => {
    it('deve retornar null se o arquivo estiver vazio (data falsy)', async () => {
      mockSend.mockResolvedValueOnce({
        Body: { transformToString: jest.fn().mockResolvedValueOnce('') },
      });
      const result = await repository.getDataFromS3File('bucket', 'empty.txt');
      expect(result).toBeNull();
    });

    it('deve retornar null se o Body do objeto for undefined', async () => {
      mockSend.mockResolvedValueOnce({});
      const result = await repository.getDataFromS3File('bucket', 'empty.txt');
      expect(result).toBeNull();
    });

    it('deve retornar o texto bruto se a extensão for .txt', async () => {
      mockSend.mockResolvedValueOnce({
        Body: { transformToString: jest.fn().mockResolvedValueOnce('Texto bruto') },
      });
      const result = await repository.getDataFromS3File('bucket', 'arquivo.txt');
      expect(result).toBe('Texto bruto');
    });

    it('deve fazer parse e retornar um objeto direto se não for iterável', async () => {
      mockSend.mockResolvedValueOnce({
        Body: { transformToString: jest.fn().mockResolvedValueOnce('{"id": 1, "name": "teste"}') },
      });
      const result = await repository.getDataFromS3File('bucket', 'arquivo.json');
      expect(result).toEqual({ id: 1, name: 'teste' });
    });

    it('deve fazer parse e retornar os valores de um array/iterável', async () => {
      mockSend.mockResolvedValueOnce({
        Body: { transformToString: jest.fn().mockResolvedValueOnce('["valor1", "valor2"]') },
      });
      const result = await repository.getDataFromS3File('bucket', 'arquivo.json');
      expect(result).toEqual(['valor1', 'valor2']);
    });

    it('deve lançar erro em caso de falha de conexão S3', async () => {
      mockSend.mockRejectedValueOnce(new Error('S3 Error'));
      await expect(repository.getDataFromS3File('bucket', 'arquivo.txt')).rejects.toThrow(
        'S3 Error'
      );
    });
  });

  describe('getTextFileFromS3File', () => {
    it('deve retornar o conteúdo do arquivo de texto', async () => {
      mockSend.mockResolvedValueOnce({
        Body: { transformToString: jest.fn().mockResolvedValueOnce('Conteúdo S3') },
      });
      const result = await repository.getTextFileFromS3File('bucket', 'teste.txt');
      expect(result).toBe('Conteúdo S3');
    });

    it('deve retornar undefined se o Body do objeto for undefined', async () => {
      mockSend.mockResolvedValueOnce({});
      const result = await repository.getTextFileFromS3File('bucket', 'teste.txt');
      expect(result).toBeUndefined();
    });

    it('deve lançar erro em caso de falha na SDK do S3', async () => {
      mockSend.mockRejectedValueOnce(new Error('SDK Error'));
      await expect(repository.getTextFileFromS3File('bucket', 'teste.txt')).rejects.toThrow(
        'SDK Error'
      );
    });
  });
});
