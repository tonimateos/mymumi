# MyMuMe 👾

MyMuMe (My Musical Me) is a social platform that encourages people to connect if their musical tastes are similar.

It is based on:

* the assumption that for many people, the music they listen to is a reflection of their personality and character,
* the fact that "the music they listen to" can be conveniently specified with only one or two links to the playlists they've built over time.

MyMuMe allows you to confer your musical identity in a simple, fast and fun way, by creating your MuMe (your Musical Me).

MuMes can then try to connect with other MuMes, a fun process based on matching their sonic personas. Successfully connecting allows discovery of other MuMes songs, and soon, chats and other interactions.

## The Fun Part: AI Generative Music

MuMes know how to sing based on the tastes of their creators. They sing when they are born, and they try to match with other MuMes by singing to them, listening how others sing and, even trying to sing together.

The project uses state of the art Generative AI Music deep nets, including [ACE-Step-1.5](https://ace-step.github.io/ace-step-v1.5.github.io/) and [Gemini's Lyria](https://gemini.google/overview/music-generation/). 


## Current Status

The application is being Vibe coded using Antigravity. So far, total time spent by a human is about 4 hours. The deploy uses the Digital Ocean App Platform.

Songs are static, not generated on the fly, they have been produced with the aforementioned networks. We'll soon move from mocks to generated songs.

## Getting Started

### Prerequisites
- Node.js >= 22.0.0
- A Google Generative AI API Key (Gemini)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/tonimateos/mymume.git
   cd mymume
   ```

2. Install dependencies:
   ```bash
   npm ci
   ```

3. Configure environment variables:
   Copy `.env.example` to `.env.local` and fill in your credentials:
   - `DATABASE_URL` (SQLite by default)
   - `NEXTAUTH_SECRET`
   - `GOOGLE_GENERATIVE_AI_API_KEY`

4. Initialize the database:
   ```bash
   npx prisma migrate dev
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

## Testing Strategy

We maintain project robustness through a tiered testing approach, ensuring both internal logic and external integrations work as expected.

### 1. Unit & Integration Tests (Vitest)
Used for testing individual React components and utility functions in isolation.
- **Tool**: [Vitest](https://vitest.dev/) + React Testing Library.
- **Run**: `npm run test:unit`

### 2. End-to-End Tests (Playwright)
Used for verifying full user journeys. To ensure reliability and speed, we use a **Hybrid Mocking Strategy** for Spotify:
- **Scraper Mocking**: We test the Playwright-based Spotify scraper against local HTML fixtures (`tests/fixtures/`) to verify selector logic without hitting live Spotify servers.
- **Tool**: [Playwright](https://playwright.dev/).
- **Run**: `npm run test:e2e`

### 3. Database Connectivity
Verify that the database is reachable and Prisma is correctly configured.
- **Run**: `npx playwright test tests/e2e/database.test.ts`

### 4. Coverage
Monitor how much of the codebase is covered by tests:
- **Run**: `npm run test:coverage`

## Linting

Keep the codebase clean:
- **Run**: `npm run lint`

---

## Interested in contributing? 🤝

We welcome contributions of all kinds! Whether you're fixing a bug, suggesting a new feature, or improving documentation, your help is appreciated.

1. **Fork** the repository.
2. **Create a branch** for your feature or fix.
3. **Open a Pull Request** describing your changes.

Let's build the future of musical identity together! 🚀