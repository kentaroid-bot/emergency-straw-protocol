import {Buffer} from 'buffer';
import {Connection,Transaction} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction,createTransferCheckedInstruction} from '@solana/spl-token';
import {pk,assertDevnet,readInstance,readPerson,readClock,currentDay,remaining,amount,budgetInstructions,enrollInstruction,paymentInstructions,envelope,inspectPayment} from './protocol.mjs';
globalThis.Buffer=Buffer;
const $=id=>document.getElementById(id),RPC='https://api.devnet.solana.com';
const connection=new Connection(RPC,'confirmed');
let manifest,program,config,instance,provider,wallet,person,credit=0n,chainTime=0n,clockReadAt=0,reviewed,busy=false,generation=0;
const write=(id,text)=>{$(id).textContent=text;};
function notice(text,error=false){write('status',text);$('status').classList.toggle('error',error);}
function invalidate(){reviewed=null;$('accept').disabled=true;write('review','');}
function controls(){const ready=Boolean(wallet&&instance)&&!busy;for(const id of ['enroll','refresh','inspect','transfer'])$(id).disabled=!ready;
 $('prepare').disabled=!ready||!person;$('enroll').disabled=!ready||Boolean(person);$('connect').disabled=busy||Boolean(wallet);$('disconnect').disabled=busy||!wallet;$('instance').disabled=busy;$('accept').disabled=!ready||!reviewed;}
async function task(fn){if(busy)return;busy=true;controls();try{await fn();}catch(e){notice(e.message||String(e),true);}finally{busy=false;controls();}}
function snapshot(){if(!wallet||!instance)throw Error('Phantomと配備済みの循環設定を接続してください。');return {wallet,config,program,generation};}
function unchanged(s){if(s.generation!==generation||!wallet?.equals(s.wallet)||String(config)!==String(s.config))throw Error('ウォレットまたは設定が変わりました。最初からやり直してください。');}
function clearWallet(){generation++;wallet=null;person=null;credit=0n;invalidate();$('outgoing').value='';$('copy').disabled=true;write('wallet','未接続');write('remaining','—');write('credit','—');write('enrollment','');controls();}
async function refresh(){
 const s=snapshot();await assertDevnet(connection);
 const [p,t,b]=await Promise.all([readPerson(connection,program,config,wallet),readClock(connection),connection.getAccountInfo(getAssociatedTokenAddressSync(instance.mint,wallet),'confirmed')]);unchanged(s);
 if(b&&(!b.owner.equals(TOKEN_PROGRAM_ID)||b.data.length!==165||!pk(b.data.subarray(0,32)).equals(instance.mint)||!pk(b.data.subarray(32,64)).equals(wallet)))throw Error('クレジット口座の情報が一致しません。');
 person=p;chainTime=t;clockReadAt=Date.now();credit=b?Buffer.from(b.data).readBigUInt64LE(64):0n;
 write('remaining',person?String(remaining(person,currentDay(t,instance))):'未登録');write('credit',String(credit));
 write('enrollment',person?'参加済み。登録し直しても、その日の枠は増えません。':'参加登録すると日次枠を使えます。');controls();tick();
}
function tick(){if(!instance||!clockReadAt)return;const elapsed=Math.floor((Date.now()-clockReadAt)/1000);if(elapsed>30){write('countdown','更新待ち');write('clocknote','時計が古くなりました。「残高を更新」で再取得');return;}
 const t=chainTime+BigInt(elapsed),seconds=instance.period-(t+instance.offset)%instance.period;write('countdown',`${String(seconds/3600n).padStart(2,'0')}:${String(seconds/60n%60n).padStart(2,'0')}:${String(seconds%60n).padStart(2,'0')}`);write('clocknote',instance.period===120n?'体験用：120秒を一日とします':'日本時間の午前0時更新・表示は推定');
 if(person)write('remaining',String(remaining(person,currentDay(t,instance))));}
function logSignature(sig){const li=document.createElement('li'),a=document.createElement('a');a.href=`https://explorer.solana.com/tx/${sig}?cluster=devnet`;a.target='_blank';a.rel='noopener noreferrer';a.textContent=sig;li.append(a);$('transactions').prepend(li);return li;}
async function broadcast(tx){
 await assertDevnet(connection);if(!tx.verifySignatures())throw Error('必要な署名が揃っていません。');
 // Log the deterministic signature before sending: a network timeout can follow acceptance.
 const sig=await import('bs58').then(m=>m.default.encode(tx.signature));const li=logSignature(sig);
 notice('Devnetへ送信しています。確認が終わるまで同じ支払いを作り直さないでください。');
 try{await connection.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:3});
  for(let i=0;i<20;i++){const {value:[s]}=await connection.getSignatureStatuses([sig],{searchTransactionHistory:true});
   if(s?.err){li.append(' · 失敗');throw Error(`チェーンで失敗：${JSON.stringify(s.err)}`);}
   if(s&&['confirmed','finalized'].includes(s.confirmationStatus)){li.append(' · 確認済み');return sig;}
   await new Promise(resolve=>setTimeout(resolve,1500));}
  li.append(' · 確認待ち');throw Error('送信結果は未確定です。リンク先で確認し、残高を更新してください。');
 }catch(e){if(!li.textContent.includes('失敗'))li.append(' · 結果をExplorerで確認');throw Error(`${e.message} 同じ支払いの再作成前に、表示した署名の結果と残高を確認してください。`);}
}
async function signAndSend(instructions){const s=snapshot();await assertDevnet(connection);const latest=await connection.getLatestBlockhash('confirmed');unchanged(s);
 const tx=new Transaction({feePayer:s.wallet,recentBlockhash:latest.blockhash}).add(...budgetInstructions(),...instructions),message=tx.serializeMessage();const signed=await provider.signTransaction(tx);unchanged(s);
 if(!signed.serializeMessage().equals(message))throw Error('署名時に取引内容が変わりました。');await broadcast(signed);await refresh();}
async function selectInstance(){generation++;instance=null;person=null;clockReadAt=0;invalidate();$('outgoing').value='';$('copy').disabled=true;write('remaining','—');write('credit','—');write('countdown','—');controls();
 const selected=manifest?.instances?.[$('instance').value];if(!manifest?.program||!selected){write('deployment','Devnet未配備です。配備情報が保存されると操作できます。');return;}
 program=pk(manifest.program);config=pk(selected.config);await assertDevnet(connection);instance=await readInstance(connection,program,config);write('deployment',`Devnet · ${instance.period===120n?'120秒体験用':'一日循環'} · Mint ${instance.mint}`);
 if(wallet)await refresh();controls();}
$('connect').onclick=()=>task(async()=>{
 provider=window.phantom?.solana;if(!provider?.isPhantom)throw Error('Phantom拡張を利用できるブラウザで開いてください。');
 provider.removeListener?.('disconnect',clearWallet);provider.on('disconnect',clearWallet);
 provider.removeListener?.('accountChanged',accountChanged);provider.on('accountChanged',accountChanged);
 const result=await provider.connect();wallet=pk(result.publicKey);generation++;write('wallet',wallet.toBase58());if(instance)await refresh();notice('接続しました。');
});
function accountChanged(){clearWallet();notice('アカウントが変更されました。「Phantomに接続」で接続し直してください。');}
$('disconnect').onclick=()=>task(async()=>{await provider?.disconnect();clearWallet();});
$('instance').onchange=()=>task(selectInstance);
$('refresh').onclick=()=>task(async()=>{await refresh();notice('チェーン上の残高を更新しました。');});
$('enroll').onclick=()=>task(async()=>{await signAndSend([enrollInstruction(program,config,wallet)]);notice('参加登録しました。まだトークンは発行されていません。');});
$('prepare').onclick=()=>task(async()=>{
 $('outgoing').value='';$('copy').disabled=true;await refresh();const s=snapshot(),recipient=pk($('recipient').value.trim());if(recipient.equals(wallet))throw Error('別の受取人を指定してください。');
 const day=currentDay(chainTime,instance),value=amount($('amount').value,remaining(person,day)),latest=await connection.getLatestBlockhash('confirmed');unchanged(s);
 const tx=new Transaction({feePayer:wallet,recentBlockhash:latest.blockhash}).add(...paymentInstructions(program,config,wallet,recipient,value,day,person.nonce));const message=tx.serializeMessage();
 const signed=await provider.signTransaction(tx);unchanged(s);if(!signed.serializeMessage().equals(message))throw Error('署名時に取引内容が変わりました。');
 $('outgoing').value=envelope(signed,program,config);$('copy').disabled=false;notice('支払データを相手へ渡してください。まだ発行・決済はされていません。');
});
$('copy').onclick=()=>task(async()=>{await navigator.clipboard.writeText($('outgoing').value);notice('支払データをコピーしました。');});
$('incoming').oninput=invalidate;
async function validateIncoming(){const s=snapshot();const parsed=inspectPayment($('incoming').value,program,config,wallet);
 const [p,t,valid]=await Promise.all([readPerson(connection,program,config,parsed.consumer),readClock(connection),connection.isBlockhashValid(parsed.tx.recentBlockhash,'confirmed')]);unchanged(s);
 if(!p||p.nonce!==parsed.nonce||parsed.day!==currentDay(t,instance)||parsed.value>remaining(p,parsed.day)||!valid.value)throw Error('この支払いは期限切れ・処理済み・枠不足のいずれかです。支払者に再確認してください。');return parsed;
}
$('inspect').onclick=()=>task(async()=>{invalidate();await assertDevnet(connection);reviewed=await validateIncoming();write('review',`${reviewed.consumer} から ${reviewed.value} クレジットを受け取ります。この受領には生産者側のSOL支払いは含まれません。`);});
$('accept').onclick=()=>task(async()=>{const s=snapshot(),check=await validateIncoming();if(!reviewed||!check.tx.serializeMessage().equals(reviewed.tx.serializeMessage()))throw Error('支払内容をもう一度確認してください。');
 invalidate();const message=check.tx.serializeMessage(),signed=await provider.signTransaction(check.tx);unchanged(s);if(!signed.serializeMessage().equals(message))throw Error('署名時に取引内容が変わりました。');
 await broadcast(signed);$('incoming').value='';await refresh();notice('受領が成立しました。支払額が消えないクレジットとして発行されました。');
});
$('transfer').onclick=()=>task(async()=>{await refresh();const dest=pk($('transferTo').value.trim()),value=amount($('transferAmount').value,credit);if(dest.equals(wallet))throw Error('別の譲渡先を指定してください。');const src=getAssociatedTokenAddressSync(instance.mint,wallet),target=getAssociatedTokenAddressSync(instance.mint,dest);
 await signAndSend([createAssociatedTokenAccountIdempotentInstruction(wallet,target,dest,instance.mint),createTransferCheckedInstruction(src,instance.mint,target,wallet,value,0)]);notice('クレジットを譲渡しました。供給量と日次枠は変わりません。');});
setInterval(tick,1000);
setInterval(()=>{if(wallet&&instance&&!busy)task(refresh);},20000);
task(async()=>{const response=await fetch('/devnet/deployment.json',{cache:'no-store'});if(!response.ok)throw Error('配備情報を取得できません。');manifest=await response.json();if(manifest.cluster!=='devnet'||manifest.rpc!==RPC)throw Error('Devnet以外の設定を拒否しました。');await selectInstance();});
