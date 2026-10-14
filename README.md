![GitHub](https://img.shields.io/github/license/gustavoadolfo/minhoteca-adapter-layer)
![npm](https://img.shields.io/npm/v/@gustavoadolfo/minhoteca-adapter-layer)
![CI](https://github.com/gustavoadolfo/minhoteca-adapter-layer/actions/workflows/ci.yml/badge.svg)
![Tests](https://img.shields.io/badge/tests-61%20passed-success)

# Minhoteca Adapter Layer

**Camada principal de entidades e modelos de dados do projeto Minhoteca.**

Este projeto oferece classes, objetos de valor e DTOs reutilizáveis para acelerar o desenvolvimento das funções Lambda e microsserviços do ecossistema Minhoteca.

## 🎯 Propósito Social

Minhoteca tem como missão facilitar o acesso gratuito à leitura, gestão de empréstimos e organização de pequenas bibliotecas em comunidades, ONGs e projetos sociais, contribuindo para os Objetivos de Desenvolvimento Sustentável (ODS) da ONU — especialmente os que tratam de educação de qualidade e redução das desigualdades.

**Alinhamento aos ODS:**

- 🎓 ODS 4: Educação de Qualidade
- 📚 ODS 10: Redução das Desigualdades
- 💚 ODS 17: Parcerias para a Implementação dos Objetivos

## ✨ Funcionalidades

- **Integrações Nativas:** Repositórios robustos e padronizados para `MongoDB`, `DynamoDB` e `AWS S3`.
- **Tratamento de Erros e Logs:** Ampla utilização do `LogService` em todas as classes, proporcionando logs traduzidos, padronizados (emojis) e excelente observabilidade.
- **Infraestrutura como Código:** Módulo Terraform incluso para provisionamento simplificado de Lambda Layers na AWS.
- **Testes Completos:** Alta cobertura de testes unitários integrados ao CI.
- **CI/CD Automatizado:** Validações rigorosas de linting, testes e automação de deploy via GitHub Actions.
- **Compatibilidade Moderna:** Suporte garantido ao `Node.js 24.x`.

## 🚀 Começar Rápido

### Instalação

```bash
npm install @gustavoadolfo/minhoteca-adapter-layer
```

### Uso Básico

```typescript
import {
  DynamoDBRepository,
  MongoDBRepository,
  S3Repository,
} from '@gustavoadolfo/minhoteca-adapter-layer';

// Instanciar um repositório (com logs e tratamentos de erro nativos)
const dynamoRepo = new DynamoDBRepository();

// Buscar um item por ID na AWS
const item = await dynamoRepo.findByMinhotecaId('MinhasTabelas', '12345');
console.log(item.data);
```

## 📚 Documentação

### Listagem completa no DynamoDB

`DynamoDBRepository.getAll` percorre todas as páginas do Scan usando
`LastEvaluatedKey` como `ExclusiveStartKey`, inclusive páginas intermediárias
sem itens. A ordenação é aplicada após reunir os registros, e `totalDocuments`
conta todos eles. Falhas em qualquer página são propagadas, sem retornar uma
lista parcial como sucesso. A resposta continua sendo uma única lista em
`data`; este método não aplica paginação por `page`/`limit`.
Recompile e publique a layer para que as Lambdas recebam este comportamento.

### Administração de usuários Cognito

`CognitoFacade` centraliza operações do user pool. Configure `USER_POOL_ID`,
`AWS_REGION` e credenciais AWS no backend; a role precisa das permissões IAM
`cognito-idp` correspondentes aos comandos utilizados. Não exponha esta facade
no frontend: autorize cada operação administrativa no serviço que a utiliza.

```typescript
import { CognitoFacade } from '@gustavoadolfo/minhoteca-adapter-layer';

const cognito = new CognitoFacade('id-da-execucao');
await cognito.adminUpdateUserAttributes('username-ou-sub', [
  { Name: 'name', Value: 'Nome atualizado' },
  { Name: 'custom:bibliotecaId', Value: 'biblioteca-123' },
]);
await cognito.adminDisableUser('username-ou-sub');
await cognito.adminEnableUser('username-ou-sub');

const users = await cognito.listUsers();
const page = await cognito.listUsersPage({
  Limit: 20,
  Filter: 'status = "Enabled"',
});
if (page.PaginationToken) {
  await cognito.listUsersPage({
    Limit: 20,
    Filter: 'status = "Enabled"',
    PaginationToken: page.PaginationToken,
  });
}
```

- `getUserAttributes(accessToken)` consulta o usuário autenticado; as operações
  administrativas usam `Username` aceito pelo Cognito (inclusive `sub` quando
  permitido pelo pool), sem exigir o token do usuário.
- `adminGetUserAttributes(username)` consulta atributos e estado do usuário.
- `adminUpdateUserAttributes(username, attributes)` edita atributos padrão e
  personalizados mutáveis já definidos no schema. Use o prefixo `custom:` para
  atributos personalizados. O schema do pool e o atributo `sub` não são editados.
  Um valor vazio remove o valor do atributo, conforme as regras do Cognito.
  A assinatura legada `(username, region, attributes)` continua aceita, mas
  `region` não altera a região do cliente; use `AWS_REGION`.
- `listUsers(options?)` percorre todas as páginas e retorna um array, incluindo
  usuários desabilitados e todos os atributos por padrão. `Filter`,
  `AttributesToGet`, `Limit` (tamanho de página, não limite total) e
  `PaginationToken` inicial são opcionais. `listUsersPage(options?)` retorna
  uma única resposta do SDK com o token para a próxima página.
- `adminSetUserPassword(username, password, permanent = false)` define uma senha
  temporária por padrão; passe `true` para uma senha permanente.
- `adminResetUserPassword(username)` inicia o fluxo de redefinição do Cognito
  (exige um canal de recuperação verificado e a configuração de entrega do pool).
- `adminConfirmSignUp(username)` confirma o cadastro, sem verificar automaticamente
  o email ou telefone.
- `adminUserGlobalSignOut(username)` invalida as sessões no Cognito. Validadores
  locais de JWT podem aceitar tokens já emitidos até sua expiração.

Erros de configuração, validação e SDK são registrados e propagados ao chamador.
Tokens, senhas e respostas com atributos não são registrados pela facade.

- **[Arquitetura e Conceitos](./docs/ARCHITECTURE.md)** - Domain-Driven Design, Entities, Value Objects
- **[Exemplos Práticos](./docs/EXAMPLES.md)** - Código real para diferentes cenários
- **[Deploy em Lambda Layer](./docs/LAMBDA_LAYER_DEPLOYMENT.md)** - Guia passo-a-passo para AWS

## 🏗️ Estrutura

```
src/
├── entities/       # Livro, Autor, Editora
├── value-objects/  # ISBN, Email, Nome, Data
├── dtos/          # Data Transfer Objects
├── adapters/      # Conversão Entity ↔ DTO
├── errors/        # Erros de domínio
└── __tests__/     # Testes (61 casos)
```

## 🧪 Testes

```bash
npm test              # Rodar testes unitários
npm test:coverage    # Ver cobertura
npm test:watch      # Modo watch
npm run test:integration # Rodar testes de integração (requer configuração local/AWS)
```

## 🔨 Desenvolvimento

```bash
npm run build       # Compilar TypeScript
npm run lint        # ESLint
npm run lint:fix    # Auto-corrigir
npm run clean       # Limpar dist/
```

## 📦 Como Lambda Layer

A layer é automaticamente publicada quando você cria uma tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Veja [Deploy em Lambda Layer](./docs/LAMBDA_LAYER_DEPLOYMENT.md) para instruções detalhadas.

## 🤝 Contribuir

Queremos sua contribuição! Veja [CONTRIBUTING.md](./CONTRIBUTING.md) para:

- Padrões de código
- Como escrever testes
- Processo de PR
- Convenção de commits

Contribuições em qualquer nível são bem-vindas:

- 🐛 Reportar bugs
- 📝 Melhorar documentação
- ✨ Sugerir features
- 🔧 Submeter PRs

## 📋 Roadmap

**v0.2.0** (Próximo):

- [ ] Entidade Empréstimo
- [ ] Repository interfaces
- [ ] DynamoDB examples
- [ ] AWS SDK helpers

**v0.3.0**:

- [ ] Rate limiting utilities
- [ ] Logging helpers
- [ ] Webhook support

## 📄 Licença

Distribuído sob licença **MIT** (veja [LICENSE](./LICENSE)).

Escolhemos MIT para incentivar:

- ✅ Uso comercial
- ✅ Modificações
- ✅ Distribuição
- ✅ Uso privado

**Único requisito**: Incluir aviso de copyright e licença.

## 🔗 Links

- [GitHub](https://github.com/GustavoAdolfo/minhoteca-adapter-layer)
- [npm](https://www.npmjs.com/package/@GustavoAdolfo/minhoteca-adapter-layer)
- [Issues](https://github.com/GustavoAdolfo/minhoteca-adapter-layer/issues)

## 💬 Suporte

- 📖 Leia a [documentação](./docs)
- 🐛 Abra uma [Issue](https://github.com/GustavoAdolfo/minhoteca-adapter-layer/issues)
- 💡 Veja os [exemplos](./docs/EXAMPLES.md)

---

**Minhoteca é código aberto e feito com ❤️ para a comunidade.**

Junte-se a nós na missão de democratizar o acesso à leitura! 📚
