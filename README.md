# Loci

**Loci is an audio-first indoor spatial guidance system for structured environments.**
It combines deterministic routing, environmental validation, and bounded AI to deliver calm, context-aware guidance without requiring continuous screen interaction.

Designed for structured indoor environments such as corporate campuses, tech parks, museums, and institutional buildings.

---

## Overview

Indoor environments are structured by design, but most navigation systems treat them as approximate maps.

Loci approaches the problem differently.

It models space deterministically, validates environmental confidence before speaking, and restricts AI strictly to language tasks.

The guiding principle:

> Speak only when confident. Stay silent when unsure.

---

## Core Principles

* Audio-first interaction
* Minimal screen dependency
* Silence > incorrect information
* Deterministic routing over probabilistic guessing
* Confidence-gated narration
* Strict separation between spatial logic and AI

---

## Architecture

Loci is structured into three independent layers to ensure predictability, stability, and scalability.

### 1. Deterministic Spatial Layer

Responsible for modeling the environment and computing routes.

* Graph-based indoor modeling
* Nodes: corridors, junctions, lifts, stairs
* Edges: walkable connections
* A* pathfinding algorithm

This layer:

* Computes shortest paths
* Does not rely on AI
* Is independent of signal fluctuations

---

### 2. Confidence Layer

Acts as a permission system between environmental signals and user-facing audio.

Inputs:

* WiFi anchor similarity
* Route expectation checks
* Stickiness logic to prevent jitter

Outputs:

* LOW → silence
* MED → silence
* HIGH → allow narration

This layer prevents incorrect triggers and maintains calm user experience.

---

### 3. AI Language Layer (Bounded)

Responsible only for language tasks.

* Intent extraction (e.g., navigation commands)
* Natural narration phrasing
* Retrieval-based Q&A using approved knowledge capsules

AI:

* Does not compute routes
* Does not estimate location
* Does not modify confidence state
* Operates strictly within defined boundaries

---

## Repository Structure

```
loci/
  frontend/     # Mobile application (React Native / Expo)
  backend/      # API server + AI orchestration
  docs/         # System design documentation
```

---

## Backend Responsibilities

* Versioned location pack distribution
* Controlled AI orchestration API
* PostgreSQL database for pack metadata and audit logs

---

## Frontend Responsibilities

* Offline pack loading
* Deterministic routing engine
* Confidence state machine
* Audio playback management
* Voice-first interaction

---

## Tech Stack

* Frontend: React Native (Expo)
* Backend: Node.js + Express
* Database: PostgreSQL
* AI: LLM via controlled API layer

---

## Current Status

* Backend architecture initialized
* Database schema implemented
* API scaffolding in progress
* Frontend routing engine under development

---

## Design Philosophy

Loci is built with strict separation of concerns:

* Spatial logic is deterministic
* Environmental validation is independent
* AI is bounded and controlled

This ensures reliability, predictability, and scalability across structured indoor deployments.
