import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SERVICE_TYPE, createClient } from '../factories/aws-client.factory';
import { LogService } from '@gustavoadolfo/minhoteca-core-layer';

export class S3Repository {
  client: S3Client;
  private logService = new LogService('S3Repository');

  /**
   *
   */
  constructor() {
    this.client = createClient(SERVICE_TYPE.S3) as S3Client;
    this.logService.info('✅ Cliente S3 configurado e inicializado');
  }

  async createPreSignedUrlPut(
    bucketName: string,
    objectName: string,
    contentType: string,
    forcePathStyle = false
  ): Promise<string> {
    this.logService.info(
      `🔗 Gerando URL pré-assinada (PUT) para o arquivo ${objectName} no bucket ${bucketName}...`,
      { contentType, forcePathStyle }
    );
    try {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: objectName,
        ContentType: contentType,
      });
      if (forcePathStyle) {
        this.client.config.forcePathStyle = true;
      }
      const url = await getSignedUrl(this.client, command, {
        expiresIn: 60 * 60,
      });
      this.logService.info(`✅ URL pré-assinada (PUT) gerada com sucesso para ${objectName}!`);
      return url;
    } catch (error: unknown) {
      this.logService.error(
        `❌ Erro ao gerar URL pré-assinada (PUT) para ${objectName}`,
        { bucketName },
        error as Error
      );
      throw error;
    }
  }

  async createPreSignedUrlGet(
    bucketName: string,
    objectName: string,
    contentType: string,
    forcePathStyle = false
  ): Promise<string> {
    this.logService.info(
      `🔗 Gerando URL pré-assinada (GET) para o arquivo ${objectName} no bucket ${bucketName}...`,
      { contentType, forcePathStyle }
    );
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: objectName,
        ResponseContentType: contentType,
      });
      if (forcePathStyle) {
        this.client.config.forcePathStyle = true;
      }
      const url = await getSignedUrl(this.client, command, {
        expiresIn: 7 * 24 * 60 * 60,
      });
      this.logService.info(`✅ URL pré-assinada (GET) gerada com sucesso para ${objectName}!`);
      return url;
    } catch (error: unknown) {
      this.logService.error(
        `❌ Erro ao gerar URL pré-assinada (GET) para ${objectName}`,
        { bucketName },
        error as Error
      );
      throw error;
    }
  }

  async getDataFromS3File(bucketName: string, keyFile: string): Promise<unknown | null> {
    this.logService.info(`📥 Buscando arquivo (dados) ${keyFile} do bucket ${bucketName}...`);
    try {
      const cmd = new GetObjectCommand({
        Bucket: bucketName,
        Key: keyFile,
      });
      const content: GetObjectCommandOutput = await this.client.send(cmd);
      const data = await content.Body?.transformToString();
      if (!data) {
        this.logService.warn(
          `⚠️ Nenhum conteúdo retornado para o arquivo ${keyFile} no bucket ${bucketName}.`
        );
        return null;
      }
      if (keyFile.endsWith('.txt')) {
        this.logService.info(`✅ Arquivo de texto .txt carregado com sucesso (${keyFile}).`);
        return data;
      }

      const list = JSON.parse(data);
      if (typeof list[Symbol.iterator] === 'function') {
        const result = Object.entries(list)
          .map((item) => item[1])
          .filter((value) => value !== undefined);
        this.logService.info(`✅ Dados JSON (lista) processados com sucesso (${keyFile}).`);
        return result;
      }
      this.logService.info(`✅ Dados JSON (objeto) processados com sucesso (${keyFile}).`);
      return list ?? null;
    } catch (error: unknown) {
      this.logService.error(
        `❌ Erro ao buscar/processar dados do S3 (${keyFile})`,
        { bucketName },
        error as Error
      );
      throw error;
    }
  }

  async getTextFileFromS3File(bucketName: string, keyFile: string): Promise<string | undefined> {
    this.logService.info(`📄 Buscando arquivo de texto ${keyFile} do bucket ${bucketName}...`);
    try {
      const cmd = new GetObjectCommand({
        Bucket: bucketName,
        Key: keyFile,
      });
      const content: GetObjectCommandOutput = await this.client.send(cmd);
      const fileContent = await content.Body?.transformToString();
      this.logService.info(`✅ Arquivo de texto carregado com sucesso (${keyFile}).`);
      return fileContent;
    } catch (error: unknown) {
      this.logService.error(
        `❌ Erro ao buscar arquivo de texto do S3 (${keyFile})`,
        { bucketName },
        error as Error
      );
      throw error;
    }
  }
}
