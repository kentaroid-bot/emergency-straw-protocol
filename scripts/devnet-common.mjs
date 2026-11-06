import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {Connection,Keypair,Transaction,sendAndConfirmTransaction} from '@solana/web3.js';
import {assertDevnet} from '../app/protocol.mjs';
export const connection=new Connection('https://api.devnet.solana.com','confirmed');
export async function key(name){await mkdir('private',{recursive:true,mode:0o700});const path=`private/${name}.json`;try{return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(path,'utf8'))));}catch(e){if(e.code!=='ENOENT')throw e;const k=Keypair.generate();await writeFile(path,JSON.stringify([...k.secretKey]),{mode:0o600,flag:'wx'});return k;}}
export async function payer(){await assertDevnet(connection);const k=await key('devnet-payer');await chmod('private/devnet-payer.json',0o600);return k;}
export async function send(instructions,signers){await assertDevnet(connection);const tx=new Transaction().add(...instructions);return sendAndConfirmTransaction(connection,tx,signers,{commitment:'confirmed',preflightCommitment:'confirmed'});}
export async function save(path,value){await writeFile(path,JSON.stringify(value,null,2)+'\n');}
