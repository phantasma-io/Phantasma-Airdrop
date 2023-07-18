import * as fs from 'fs';
import csv from 'csv-parser';
import { Address, Base16, PhantasmaAPI, PhantasmaKeys, ScriptBuilder, Timestamp, Transaction }  from 'phantasma-ts';
import * as dotenv from "dotenv";

dotenv.config();

interface Data {
  address: string;
  txid: string;
  amount: string;
  symbol: string;
}

const API_URL = process.env.API_URL;
const NexusName = process.env.NEXUS_NAME;
const ChainName = process.env.CHAIN_NAME;
const Payload = Base16.encode(process.env.PAYLOAD);
const Keys = PhantasmaKeys.fromWIF(process.env.WIF);
const FilePath : string = process.env.FILE_PATH;

const GasPrice : number = Number(process.env.GAS_PRICE);
const GasLimit : number = Number(process.env.GAS_LIMIT);

const api = new PhantasmaAPI(API_URL, null, NexusName);
const results: Data[] = [];


async function ReadDataFromCSV(){
  fs.createReadStream(FilePath)
  .pipe(csv())
  .on('data', (data: Data) => results.push(data))
  .on('end', async () => {
    console.log("File read");
    // handle end of CSV
    await SendAirdrop();
  });
}

async function SendAirdrop() {
  let expiration : Date = new Date(Date.now() + 60 * 20 * 1000);
  console.log("Expiration:", expiration);
  let script : string;


  let sb = new ScriptBuilder();
  let myScript = sb.AllowGas(Keys.Address, Address.Null, GasPrice, GasLimit);
  for (let element of results) 
  {
    console.log("elements->",element.address, element.symbol, element.amount);
    myScript = sb.CallInterop("Runtime.TransferTokens", [Keys.Address.Text, element.address, element.symbol, String(element.amount)]);
  }
  
  myScript = sb.SpendGas(Keys.Address);
  script = myScript.EndScript();
  const tx = new Transaction(
    NexusName,
    ChainName,
    script,
    expiration,
    Payload
  );

  tx.signWithKeys(Keys);
  const rawTx = Base16.encodeUint8Array(tx.ToByteAray(true));
  console.log(rawTx);
  await api.sendRawTransaction(rawTx);
  console.log("Transaction sent");
}

async function RunProgram(){
  await ReadDataFromCSV();
  //await SendAirdrop();
}

RunProgram();