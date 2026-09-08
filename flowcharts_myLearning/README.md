# Flowcharts & Deep-Dive Docs

Reference notes grouped by topic. Each folder is one subject area.

> DSA, dynamic programming and complexity notes (formerly `code_doc/`) now live in the
> **dsa-kit** repo, under `dp/`, `patterns/` and `complexity/`.

## `ai_doc/` — AI/LLM terminology, practical examples, RAG, and MCP.

- [ai_terminologies_guide.md](ai_doc/ai_terminologies_guide.md) — AI Terminologies Guide — 2025/2026 Edition
- [ai_terms_practical_example.md](ai_doc/ai_terms_practical_example.md) — AI Terms — 2025-2026 Real World Examples
- [GenAI_AIAgents_AgenticAI.md](ai_doc/GenAI_AIAgents_AgenticAI.md) — GenAI vs AI Agents vs Agentic AI
- [mcp_copilot_comprehensive_guide.md](ai_doc/mcp_copilot_comprehensive_guide.md) — Model Context Protocol (MCP) & GitHub Copilot Comprehensive Guide
- [RAG_MCP.md](ai_doc/RAG_MCP.md) — RAG and MCP

## `system_design_doc/` — HLD topics: capacity estimation, architecture, API style.

- [archiTecture.md](system_design_doc/archiTecture.md) — High Level Architecture — request path from internet to data layer
- [back_of_envelope_calculations.md](system_design_doc/back_of_envelope_calculations.md) — Back of the Envelope Calculations
- [rest_vs_http_guide.md](system_design_doc/rest_vs_http_guide.md) — REST vs HTTP - A Simple Guide
- [shared_database_microservices.md](system_design_doc/shared_database_microservices.md)
- [website_architecture_detailed.md](system_design_doc/website_architecture_detailed.md) — 🌐 How Websites Are Served - Complete Architecture Guide

## `database_doc/` — Database selection, trade-offs, scaling, replication, caching.

- [database_selection_guide.md](database_doc/database_selection_guide.md) — Database & Storage Selection Guide
- [database_tradeoffs_guide.md](database_doc/database_tradeoffs_guide.md) — Database Tradeoffs — Complete System Design Guide
- [elasticache_redis_comprehensive_guide.md](database_doc/elasticache_redis_comprehensive_guide.md) — ElastiCache Redis Comprehensive Guide
- [master_slave_vs_cluster.md](database_doc/master_slave_vs_cluster.md) — Master-Slave vs Cluster Architecture
- [openai_postgres_scale_guide.md](database_doc/openai_postgres_scale_guide.md) — How OpenAI Handles 800 Million ChatGPT Users on a Single PostgreSQL Primary
- [sharding_replication_guide.md](database_doc/sharding_replication_guide.md) — Sharding & Replication — Complete Guide

## `networking_doc/` — IP, DNS, nameservers, browser networking, proxies, domain mapping.

- [browser_network_guide.md](networking_doc/browser_network_guide.md) — Browser Networking — Complete Guide
- [DNSmapping.md](networking_doc/DNSmapping.md) — DNS Mapping — GoDaddy → Cloudflare → AWS
- [dns_hosting_documentation.md](networking_doc/dns_hosting_documentation.md) — DNS Hosting - Complete Guide with Real Examples
- [dns_hosting_flow.md](networking_doc/dns_hosting_flow.md) — DNS Hosting Flow - Complete Journey
- [domain_mapping_guide.md](networking_doc/domain_mapping_guide.md) — 🌐 Complete Domain Mapping Guide
- [ip_networking_guide.md](networking_doc/ip_networking_guide.md) — IP Networking — All Terms Explained Simply
- [nameServers.md](networking_doc/nameServers.md) — What are Nameservers? — registrar vs DNS authority
- [proxy_comprehensive_guide.md](networking_doc/proxy_comprehensive_guide.md) — Complete Proxy Guide: Real-World Usage & Examples

## `devops_doc/` — Docker, Kubernetes, and Cloudflare/edge infrastructure.

- [cloudflare_usecases_comprehensive_guide.md](devops_doc/cloudflare_usecases_comprehensive_guide.md) — Cloudflare Use Cases: Comprehensive Guide with Examples
- [docker_comprehensive_guide.md](devops_doc/docker_comprehensive_guide.md) — Docker — Complete Guide with Real Examples
- [K8s.md](devops_doc/K8s.md) — Why Kubernetes? — the problem it solves, before vs after
- [k8s_flow.md](devops_doc/k8s_flow.md) — Kubernetes Traffic Flow Diagram
- [k8s_flow_documentation.md](devops_doc/k8s_flow_documentation.md) — Kubernetes Traffic Flow - Comprehensive Documentation

## `security_doc/` — Authentication, authorization, zero trust access, and WAF.

- [authentication_authorization_guide.md](security_doc/authentication_authorization_guide.md) — Authentication & Authorization — Complete System Design Guide
- [cfFullAuth.md](security_doc/cfFullAuth.md) — Cloudflare Access — Full Authentication Flow
- [passkey.md](security_doc/passkey.md) — Passkeys — how public/private key login works
- [SSH.md](security_doc/SSH.md) — SSH — secure remote login, keys, and Git authentication
- [twinGate.md](security_doc/twinGate.md) — Twingate — hiding internal servers behind a gatekeeper
- [WAF_CF_Guide.md](security_doc/WAF_CF_Guide.md) — WAF (Web Application Firewall) - Complete Guide
- [zeroTrust.md](security_doc/zeroTrust.md) — Zero Trust — never trust, always verify

## `machine_doc/` — Local dev machine resources and performance.

- [ramAffect.md](machine_doc/ramAffect.md) — What Affects RAM on My Mac — Docker, VS Code, Chrome, swap

## `benchmarks_doc/` — xVerify benchmark harness, results, and analysis.

- [xverify_benchmark.js](benchmarks_doc/xverify_benchmark.js)
- [xverify_benchmarking_guide.md](benchmarks_doc/xverify_benchmarking_guide.md) — XVerify Email Validation — Benchmarking Report & Guide
- [xverify_raw_results.json](benchmarks_doc/xverify_raw_results.json)
