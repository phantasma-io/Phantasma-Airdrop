import * as fs from 'fs';
import csv from 'csv-parser';
import * as path from 'path';
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
const AirdropDirectoryPath : string = process.env.FOLDER_PATH_TO_PROCESS;
const SaveDirectoryPath : string = process.env.FOLDER_PATH_TO_SAVE;
const ErrorDirectoryPath : string = process.env.FOLDER_PATH_TO_ERROR;

const GasPrice : number = Number(process.env.GAS_PRICE);
const GasLimit : number = Number(process.env.GAS_LIMIT);

const api = new PhantasmaAPI(API_URL, null, NexusName);
//const results: Data[] = [];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ReadAllFiles(){
  // get the list of all files in the directory
  const files = await fs.readdirSync(AirdropDirectoryPath);
  const filesSaved = await fs.readdirSync(SaveDirectoryPath);

  for(const file of files) {
    if ( filesSaved.includes(file) ){
      console.info("File already processed: ", file);
      DeleteEventFile(file);
      continue;
    }

    const filePath = path.join(AirdropDirectoryPath, file);
    const results = [];
    let error = false;
    let errorMessage = "";
    let hash = "";

    console.info("Reading file: ", filePath);

    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (data: Data) => {
          data.Symbol = data.Event.replace("Deposit", "").toUpperCase();
          if (data["PhAddress"] != undefined)
            data.PhaAddress = data["PhAddress"];
          data.Decimals = data.Symbol === "SOUL" ? 8 : 10;
          data.BlockNumber = data["Block Number"];
          results.push(data);
        })
        .on('end', async () => {
          console.info("File readed", file, "with", results.length, "lines");
          hash = await SendAirdrop(file, results);
          errorMessage += "\n"+hash;
          resolve();
        })
        .on('error', async () => {
          console.info("Error reading file: ", file);
          errorMessage += "\nError reading file";
          error = true;
          reject();
        });
    });

    if ( error ) {
      await SaveFileError(file, errorMessage);
      continue;
    }

    await SaveFile(results, file, hash);

    await DeleteEventFile(file);

    // Wait 5 seconds to avoid rate limit
    await sleep(1000 * 5);
  }
}

/**
 * Delete the file from the directory
 * @param file 
 */
async function DeleteEventFile(file: string){
  console.info("Deleting file: ", file);
  await fs.rmSync(path.join(AirdropDirectoryPath, file));
}

/**
 * Save the file with the error
 * @param fileName 
 * @param error 
 */
async function SaveFileError(fileName: string, error: string){
  console.info("Error on file: ", fileName, "with error: ", error);
  await fs.existsSync(ErrorDirectoryPath) || await fs.mkdirSync(ErrorDirectoryPath);
  const filePath = path.join(ErrorDirectoryPath, fileName);

  if ( !await fs.existsSync(path.join(ErrorDirectoryPath, fileName)) ){
    await fs.copyFileSync(filePath, path.join(ErrorDirectoryPath, fileName));
  }

  await fs.appendFileSync(path.join(ErrorDirectoryPath, fileName), `\n${error}`);
}

/**
 * Save the file with the results
 */
async function SaveFile(results: Data[], fileName: string, additionalData: string){
  console.info("Saving file: ", fileName);
  await fs.existsSync(SaveDirectoryPath) || await fs.mkdirSync(SaveDirectoryPath);
  await fs.existsSync(AirdropDirectoryPath) || await fs.mkdirSync(AirdropDirectoryPath);
  const filePath = path.join(SaveDirectoryPath, fileName);

  const newFilePath = path.join(path.dirname(filePath), `${path.basename(filePath)}`);
  await fs.writeFileSync(newFilePath, `Block Number,Event,Sender,PhaAddress,Amount,Symbol,Decimals\n`);
  for(let item in results){
    await fs.appendFileSync(newFilePath, `${results[item].BlockNumber},${results[item].Event},${results[item].Sender},${results[item].PhaAddress},${results[item].Amount},${results[item].Symbol},${results[item].Decimals}\n`);
  }
  await fs.appendFileSync(newFilePath, `\n${additionalData}`);
}

async function SaveAdditionalData(fileName: string, additionalData:string){
  await fs.existsSync(SaveDirectoryPath) || await fs.mkdirSync(SaveDirectoryPath);
  const filePath = path.join(SaveDirectoryPath, fileName.replace(".csv", "_info.txt" ));
  if ( !await fs.existsSync(filePath) ){
    await fs.writeFileSync(filePath, additionalData);
    return;
  }
  await fs.appendFileSync(filePath, `\n${additionalData}`);
}


/*async function ReadDataFromCSV(){
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
}*/

async function SendAirdrop(file: string, results : Data[]) : Promise<string> {
  let expiration : Date = new Date(Date.now() + 60 * 60 * 10 * 1000);
  console.info("Expiration:", expiration);
  let script : string;

  let sb = new ScriptBuilder();
  let myScript = sb.AllowGas(Keys.Address, Address.Null, GasPrice, GasLimit);
  let totalKCAL = 0;
  let totalSOUL = 0;
  let numberOfUsers = 0;

  for (let element of results) 
  {
    if (element.PhaAddress.startsWith("0x")){
      console.info("Skipping: ", element);
      SaveFileError(file, "Elements skipped:" + JSON.stringify(element));
      continue;
    }

    if ( !IsValidAmount(element) ){
      console.info("Oversized amount: ", element);
      SaveFileError(file, "Not airdropped because of -> Oversized amount: " + JSON.stringify(element));
      return;
    }

    numberOfUsers++;

    if (element.Symbol === "SOUL"){
      totalSOUL += Number(element.Amount);
    }
    else
    {
      totalKCAL += Number(element.Amount);
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
  console.info(rawTx);
  SaveAdditionalData(file, rawTx);
  const hash = await api.sendRawTransaction(rawTx);
  console.info("Transaction sent: ", hash);
  console.info("Number of Users: ", numberOfUsers);
  console.info("Total SOUL: ", totalSOUL / 10 ** 8);
  console.info("Total KCAL: ", totalKCAL / 10 ** 10);

  SaveAdditionalData(file, `Total SOUL: ${totalSOUL / 10 ** 8}\nTotal KCAL: ${totalKCAL / 10 ** 10}\nHash: ${hash}\nNumber of Users: ${numberOfUsers}`);
  return hash;
}

function IsValidAmount(element : Data){
  let amount = Number(element.Amount);
  console.log("Amount: ", amount, "Max: ", Number(process.env.MAX_AMOUNT_OF_TOKENS_PER_USER) * 10 ** element.Decimals, "Is Valid:", amount <= Number(process.env.MAX_AMOUNT_OF_TOKENS_PER_USER) * 10 ** element.Decimals);

  if (amount >= Number(process.env.MAX_AMOUNT_OF_TOKENS_PER_USER) * 10 ** element.Decimals)
  {
    console.error("Invalid amount ", element.Amount, element.Symbol, "for address", element.PhaAddress);
    return false;
  }

  return true;
}

async function RunProgram(){
  //await ReadDataFromCSV();
  await ReadAllFiles();
  //await SendAirdrop();
}

RunProgram();