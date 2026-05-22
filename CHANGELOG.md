# Changelog

Todos os mudanças notáveis neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/),
e este projeto segue [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Implementação de Repositórios Nativos para `DynamoDB`, `MongoDB` e `AWS S3`.
- Módulo Terraform acoplado para implantação automatizada da AWS Lambda Layer.
- Configuração de "Partial Backend" no Terraform com suporte a remote state via S3/DynamoDB Locking.
- Integração estrutural do `LogService` em todos os repositórios (tradução e padronização visual com emojis).
- Workflow robusto de CI/CD pelo GitHub Actions contemplando lint, testes, provisionamento OIDC na AWS e Deploy Terraform.

### Changed

- Atualização completa do Runtime da Layer e das validações para o **Node.js 24**.
- Centralização de arquivos de hook do Husky atualizados para versão mais recente.

### Fixed

- Correção de sintaxe e permissões do Husky para ativar corretamente os validadores `pre-commit` e `commit-msg`.
- Tratamento defensivo em todas as chamadas de banco e Cloud usando `try/catch` para capturar exceções pelo Logger.

## [0.1.0] - 2024-12-07

### Initial Release

Primeira versão estável com:

- Estrutura base do projeto
- Setup de TypeScript, ESLint, Jest
- Package.json configurado para GitHub Packages
- README com propósito social destacado
