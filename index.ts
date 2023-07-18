import * as fs from 'fs';
import csv from 'csv-parser';
import { Address, Base16, PhantasmaAPI, PhantasmaKeys, ScriptBuilder, Timestamp, Transaction }  from 'phantasma-ts';
import * as dotenv from "dotenv";

dotenv.config();

interface Data {
  BlockNumber:string;
  Event: string;
  Sender: string;
  PhaAddress: string;
  Amount: string;
  Symbol: string;
  Decimals: number;
}


const API_URL = process.env.API_URL;
const NexusName = process.env.NEXUS_NAME;
const ChainName = process.env.CHAIN_NAME;
const Payload = Base16.encode(process.env.PAYLOAD);
const Keys = PhantasmaKeys.fromWIF(process.env.WIF);
//const Keys = PhantasmaKeys.generate();
const FilePath : string = process.env.FILE_PATH;

const GasPrice : number = Number(process.env.GAS_PRICE);
const GasLimit : number = Number(process.env.GAS_LIMIT);

const api = new PhantasmaAPI(API_URL, null, NexusName);
const results: Data[] = [];


async function ReadDataFromCSV(){
  fs.createReadStream(FilePath)
  .pipe(csv())
  .on('data', (data: Data) => {
    data.Symbol = data.Event.replace("Deposit", "").toUpperCase();
    data.Decimals = data.Symbol === "SOUL" ? 8 : 10;
    results.push(data)
  })
  .on('end', async () => {
    console.log("File read");
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
    if (element.PhaAddress.startsWith("0x")){
      console.log("Skipping: ", element);
      continue;
    }

    if ( !IsValidAmount(element) ){
      console.log("Oversized amount: ", element);
      return;
    }

    myScript = sb.CallInterop("Runtime.TransferTokens", [Keys.Address.Text, element.PhaAddress, element.Symbol, String(element.Amount)]);
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
  //await api.sendRawTransaction(rawTx);
  console.log("Transaction sent");
}

function IsValidAmount(element : Data){
  let amount = Number(element.Amount);
  console.log("Amount: ", amount, "Max: ", Number(process.env.MAX_AMOUNT_OF_TOKENS_PER_USER) * 10 ** element.Decimals);
  if (amount >= Number(process.env.MAX_AMOUNT_OF_TOKENS_PER_USER) * 10 ** element.Decimals)
  {
    console.log("Invalid amount ", element.Amount, element.Symbol, "for address", element.PhaAddress);
    return false;
  }

  return true;
}

async function RunProgram(){
  await ReadDataFromCSV();
  //await SendAirdrop();
}

RunProgram();