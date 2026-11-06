import {Buffer} from 'buffer';
import {PublicKey, SystemProgram, ComputeBudgetProgram, Transaction, TransactionInstruction, SYSVAR_CLOCK_PUBKEY} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction} from '@solana/spl-token';
export const DEVNET_GENESIS='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const CONFIG_LEN=81, PERSON_LEN=89, LIMIT=300n;
export const pk=x=>new PublicKey(x);
const key=(pubkey,isSigner=false,isWritable=false)=>({pubkey:pk(pubkey),isSigner,isWritable});
export function addresses(program,config,wallet){
 const p=pk(program),c=pk(config);
 const derive=s=>PublicKey.findProgramAddressSync(s,p)[0];
 return {mint:derive([Buffer.from('mint'),c.toBuffer()]),authority:derive([Buffer.from('authority'),c.toBuffer()]),
  ...(wallet?{person:derive([Buffer.from('person'),c.toBuffer(),pk(wallet).toBuffer()])}:{})};
}
export function decodeConfig(data){
 const b=Buffer.from(data);if(b.length!==CONFIG_LEN||b[0]!==1)throw Error('設定アカウントが不正です。');
 return {creator:pk(b.subarray(1,33)),mint:pk(b.subarray(33,65)),period:b.readBigInt64LE(65),offset:b.readBigInt64LE(73)};
}
export function decodePerson(data){
 const b=Buffer.from(data);if(b.length!==PERSON_LEN||b[0]!==2)throw Error('参加アカウントが不正です。');
 return {config:pk(b.subarray(1,33)),wallet:pk(b.subarray(33,65)),day:b.readBigInt64LE(65),spent:b.readBigUInt64LE(73),nonce:b.readBigUInt64LE(81)};
}
export function currentDay(timestamp,config){return (BigInt(timestamp)+config.offset)/config.period;}
export function remaining(person,day){return person&&person.day===day?LIMIT-person.spent:LIMIT;}
export function amount(text,max){
 if(!/^[1-9]\d{0,15}$/.test(String(text)))throw Error('1以上の整数を指定してください。');
 const n=BigInt(text);if(max!==undefined&&n>max)throw Error('残りの枠または残高を超えています。');return n;
}
export function initInstructions(program,config,payer,period,rent){
 if(![120,86400].includes(period))throw Error('Unsupported day duration');
 const {mint,authority}=addresses(program,config);const data=Buffer.alloc(9);data[0]=0;data.writeBigInt64LE(BigInt(period),1);
 return [SystemProgram.createAccount({fromPubkey:pk(payer),newAccountPubkey:pk(config),space:CONFIG_LEN,lamports:rent,programId:pk(program)}),
 new TransactionInstruction({programId:pk(program),keys:[key(payer,true,true),key(config,true,true),key(mint,false,true),key(authority),key(SystemProgram.programId),key(TOKEN_PROGRAM_ID)],data})];
}
export function enrollInstruction(program,config,wallet){
 const {person}=addresses(program,config,wallet);
 return new TransactionInstruction({programId:pk(program),keys:[key(wallet,true,true),key(config),key(person,false,true),key(SystemProgram.programId)],data:Buffer.from([1])});
}
export const budgetInstructions=()=>[ComputeBudgetProgram.setComputeUnitLimit({units:200_000}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:0})];
export function paymentInstructions(program,config,consumer,producer,value,day,nonce){
 const {mint,authority,person}=addresses(program,config,consumer);
 const dest=getAssociatedTokenAddressSync(mint,pk(producer));
 const data=Buffer.alloc(25);data[0]=2;data.writeBigUInt64LE(BigInt(value),1);data.writeBigInt64LE(BigInt(day),9);data.writeBigUInt64LE(BigInt(nonce),17);
 return [...budgetInstructions(),createAssociatedTokenAccountIdempotentInstruction(pk(consumer),dest,pk(producer),mint),
 new TransactionInstruction({programId:pk(program),keys:[key(consumer,true,true),key(producer,true),key(config),key(person,false,true),key(mint,false,true),key(dest,false,true),key(authority),key(TOKEN_PROGRAM_ID)],data})];
}
export async function assertDevnet(connection){
 if(await connection.getGenesisHash()!==DEVNET_GENESIS)throw Error('Devnet以外への接続を拒否しました。');
}
export async function readClock(connection){
 const a=await connection.getAccountInfo(SYSVAR_CLOCK_PUBKEY,'confirmed');
 if(!a||a.data.length<40)throw Error('チェーンの時計を取得できません。');return Buffer.from(a.data).readBigInt64LE(32);
}
export async function readInstance(connection,program,config){
 const a=await connection.getAccountInfo(pk(config),'confirmed');
 if(!a||!a.owner.equals(pk(program)))throw Error('配備済み設定を取得できません。');
 const c=decodeConfig(a.data);
 if(![120n,86400n].includes(c.period)||c.offset!==(c.period===86400n?32400n:0n)||!c.mint.equals(addresses(program,config).mint))throw Error('設定の内容が一致しません。');
 return c;
}
export async function readPerson(connection,program,config,wallet){
 const a=await connection.getAccountInfo(addresses(program,config,wallet).person,'confirmed');if(!a)return null;
 if(!a.owner.equals(pk(program)))throw Error('参加アカウントの所有者が不正です。');
 const s=decodePerson(a.data);if(!s.wallet.equals(pk(wallet))||!s.config.equals(pk(config)))throw Error('参加アカウントが一致しません。');return s;
}
// An imported partial transaction is hostile input. Reconstruct the entire allowed
// message before showing a signing action; never let payloads add arbitrary instructions.
export function inspectPayment(raw,program,config,producer){
 if(typeof raw!=='string'||raw.length>4000)throw Error('支払データの長さが不正です。');
 const envelope=JSON.parse(raw);
 if(envelope.schema!=='straw-devnet/2'||envelope.program!==String(program)||envelope.config!==String(config)||typeof envelope.tx!=='string')throw Error('別の設定の支払いです。');
 const tx=Transaction.from(Buffer.from(envelope.tx,'base64'));
 if(tx.instructions.length!==4)throw Error('許可していない命令が含まれています。');
 const ix=tx.instructions[3];if(!ix.programId.equals(pk(program))||ix.data.length!==25||ix.data[0]!==2||ix.keys.length!==8)throw Error('支払命令が不正です。');
 const consumer=ix.keys[0].pubkey,recipient=ix.keys[1].pubkey;
 if(!recipient.equals(pk(producer))||consumer.equals(recipient))throw Error('受取人のウォレットに切り替えてください。');
 const value=ix.data.readBigUInt64LE(1),day=ix.data.readBigInt64LE(9),nonce=ix.data.readBigUInt64LE(17);
 if(value<1n||value>LIMIT||!tx.feePayer?.equals(consumer))throw Error('金額または手数料支払者が不正です。');
 const expected=new Transaction({feePayer:consumer,recentBlockhash:tx.recentBlockhash}).add(...paymentInstructions(program,config,consumer,recipient,value,day,nonce));
 if(!tx.serializeMessage().equals(expected.serializeMessage()))throw Error('支払い以外の操作を検出しました。');
 const sig=tx.signatures.find(s=>s.publicKey.equals(consumer));
 if(!sig?.signature||!tx.verifySignatures(false))throw Error('支払者の署名が不正です。');
 return {tx,consumer,producer:recipient,value,day,nonce};
}
export function envelope(tx,program,config){return JSON.stringify({schema:'straw-devnet/2',program:String(program),config:String(config),tx:tx.serialize({requireAllSignatures:false}).toString('base64')});}
