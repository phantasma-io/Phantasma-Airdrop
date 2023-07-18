# Phantasma Airdrop

This is a Node.js project that interfaces with the Phantasma blockchain. It's designed to facilitate an airdrop, a process of distributing tokens to addresses, based on a list provided in a CSV file.

## Prerequisites

- [Node.js](https://nodejs.org/en/download/) (v14.0.0 or later)
- NPM (v6.0.0 or later, comes with Node.js)

## Setup

1. Clone this repository to your local machine.

```bash
git clone https://github.com/phantasma-io/Phantasma-Airdrop.git
```

2. Navigate into the project directory.

```bash
cd Phantasma-Airdrop
```

3. Install the project dependencies.

```bash
npm install
```

## Configuration

1. Rename `.env.example` to `.env`.

```bash
mv .env.example .env
```

2. Open the `.env` file in your text editor and replace the placeholder values with your actual configuration.

```bash
API_URL=https://testnet.phantasma.io/rpc
NEXUS_NAME=testnet
CHAIN_NAME=main
PAYLOAD=Airdrop - Deposit
WIF=Your_WIF
FILE_PATH=airdrop/airdrop_tokens.csv
GAS_PRICE=100000
GAS_LIMIT=210000
```

Remember to replace `Your_WIF` with your actual WIF.

## Running the Project

You can run the project in development mode with:

```bash
npm run dev
```

This command will compile the TypeScript code to JavaScript and then run the `index.ts` file with `ts-node`.
