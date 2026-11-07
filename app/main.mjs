import {Buffer} from 'buffer';
import {Connection,Transaction} from '@solana/web3.js';
import {TOKEN_PROGRAM_ID,getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction,createTransferCheckedInstruction} from '@solana/spl-token';
import {pk,assertDevnet,readInstance,readPerson,readClock,currentDay,remaining,amount,budgetInstructions,enrollInstruction,paymentInstructions,envelope,inspectPayment} from './protocol.mjs';
import {createRequest,parseRequest,inspectReturnQR} from './qr-protocol.mjs';
import {qrImage,createScanner} from './qr-media.mjs';
globalThis.Buffer=Buffer;
const $=id=>document.getElementById(id),RPC='https://api.devnet.solana.com';
const connection=new Connection(RPC,'confirmed');
let manifest,program,config,instance,provider,wallet,person,credit=0n,chainTime=0n,clockReadAt=0,reviewed,busy=false,generation=0;
let checkoutRequest=null,merchantRequest=null,outgoingInfo=null,qrRevision=0,scanning=false,scanGeneration=0;
const write=(id,text)=>{$(id).textContent=text;};
function notice(text,error=false){write('status',text);$('status').classList.toggle('error',error);}
function invalidate(){reviewed=null;$('accept').disabled=true;write('review','');}
function usingDaily(){return $('payDaily').checked;}
function showPaymentMethod(){const daily=usingDaily();$('dailyPayment').hidden=!daily;$('creditPayment').hidden=daily;
 write('paymentExplanation',daily?'日次枠で100支払うと、今日の枠は300から200へ。相手が受領に署名すると、相手に100の本トークンが新しく発行されます。自分が持っている本トークンは減りません。':'本トークンを100持っていて40支払うと、自分は60、相手は40増えます。新しく発行されず、トークンの総量も今日の枠も変わりません。残高の範囲で、300を超える支払いもできます。');
 if(daily)$('amount').max='300';else $('amount').removeAttribute('max');controls();}
function controls(){const blocked=busy||scanning,ready=Boolean(wallet&&instance)&&!blocked,confirmed=!checkoutRequest||($('confirmCheckout').checked&&Date.now()<checkoutRequest.expiresAt);for(const id of ['enroll','refresh','inspect','transfer','makeRequest','scanReturn','returnFile'])$(id).disabled=!ready;
 for(const id of ['scanRequest','requestFile'])$(id).disabled=blocked||!instance;
 for(const id of ['merchantLabel','requestAmount','recipient','amount','incoming','confirmCheckout','clearCheckout'])$(id).disabled=blocked;
 $('prepare').disabled=!ready||!person||!usingDaily()||!confirmed;$('transfer').disabled=!ready||usingDaily()||credit===0n||!confirmed;for(const id of ['payDaily','payCredit'])$(id).disabled=blocked;$('enroll').disabled=!ready||Boolean(person);$('connect').disabled=blocked||Boolean(wallet);$('disconnect').disabled=blocked||!wallet;$('instance').disabled=blocked;$('accept').disabled=!ready||!reviewed;}
async function task(fn){if(busy)return;busy=true;controls();try{await fn();}catch(e){notice(e.message||String(e),true);}finally{busy=false;controls();}}
function snapshot(){if(!wallet||!instance)throw Error('Phantomと配備済みの循環設定を接続してください。');return {wallet,config,program,generation};}
function unchanged(s){if(s.generation!==generation||!wallet?.equals(s.wallet)||String(config)!==String(s.config))throw Error('ウォレットまたは設定が変わりました。最初からやり直してください。');}
function clearWallet(){generation++;wallet=null;person=null;credit=0n;invalidate();resetQR();write('wallet','未接続');write('remaining','—');write('credit','—');write('enrollment','');controls();}
async function refresh(){
 const s=snapshot();await assertDevnet(connection);
 const [p,t,b]=await Promise.all([readPerson(connection,program,config,wallet),readClock(connection),connection.getAccountInfo(getAssociatedTokenAddressSync(instance.mint,wallet),'confirmed')]);unchanged(s);
 if(b&&(!b.owner.equals(TOKEN_PROGRAM_ID)||b.data.length!==165||!pk(b.data.subarray(0,32)).equals(instance.mint)||!pk(b.data.subarray(32,64)).equals(wallet)))throw Error('クレジット口座の情報が一致しません。');
 person=p;chainTime=t;clockReadAt=Date.now();credit=b?Buffer.from(b.data).readBigUInt64LE(64):0n;
 write('remaining',person?String(remaining(person,currentDay(t,instance))):'未登録');write('credit',String(credit));
 write('enrollment',person?'参加済み。登録し直しても、その日の枠は増えません。':'参加登録すると日次枠を使えます。');
 if(outgoingInfo){const saved=outgoingInfo;if(saved.day!==currentDay(t,instance)||p?.nonce!==saved.nonce)expireOutgoing('日付が変わったか、この支払いは処理済みです。残高と操作記録を確認してください。');else{const v=await connection.isBlockhashValid(saved.blockhash,'confirmed');unchanged(s);if(outgoingInfo===saved&&!v.value)expireOutgoing('返送QRは期限切れです。支払結果を確認してから作り直してください。');}}
 controls();tick();
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
async function signAndSend(instructions,guard=()=>{}){const s=snapshot();await assertDevnet(connection);const latest=await connection.getLatestBlockhash('confirmed');unchanged(s);
 const tx=new Transaction({feePayer:s.wallet,recentBlockhash:latest.blockhash}).add(...budgetInstructions(),...instructions),message=tx.serializeMessage();const signed=await provider.signTransaction(tx);unchanged(s);
 if(!signed.serializeMessage().equals(message))throw Error('署名時に取引内容が変わりました。');guard();await broadcast(signed);await refresh();}
async function selectInstance(){generation++;instance=null;person=null;clockReadAt=0;invalidate();resetQR();write('remaining','—');write('credit','—');write('countdown','—');controls();
 const selected=manifest?.instances?.[$('instance').value];if(!manifest?.program||!selected){write('deployment','Devnet未配備です。配備情報が保存されると操作できます。');return;}
 program=pk(manifest.program);config=pk(selected.config);await assertDevnet(connection);instance=await readInstance(connection,program,config);write('deployment',`Devnet · ${instance.period===120n?'120秒体験用':'一日循環'} · Mint ${instance.mint}`);
 if(wallet)await refresh();controls();}
$('connect').onclick=()=>task(async()=>{
 provider=window.phantom?.solana;if(!provider?.isPhantom)throw Error('PCではPhantom拡張のあるブラウザ、スマートフォンではPhantomアプリ内ブラウザで開いてください。');
 provider.removeListener?.('disconnect',clearWallet);provider.on('disconnect',clearWallet);
 provider.removeListener?.('accountChanged',accountChanged);provider.on('accountChanged',accountChanged);
 const result=await provider.connect();wallet=pk(result.publicKey);generation++;write('wallet',wallet.toBase58());if(instance)await refresh();notice('接続しました。');
});
function accountChanged(){clearWallet();notice('アカウントが変更されました。「Phantomに接続」で接続し直してください。');}
$('disconnect').onclick=()=>task(async()=>{await provider?.disconnect();clearWallet();});
$('instance').onchange=()=>task(selectInstance);
$('refresh').onclick=()=>task(async()=>{await refresh();notice('チェーン上の残高を更新しました。');});
$('enroll').onclick=()=>task(async()=>{await signAndSend([enrollInstruction(program,config,wallet)]);notice('参加登録しました。まだトークンは発行されていません。');});
$('payDaily').onchange=()=>{clearOutgoing();showPaymentMethod();};
$('payCredit').onchange=()=>{clearOutgoing();showPaymentMethod();};
$('prepare').onclick=()=>task(async()=>{
 if(!usingDaily())throw Error('日次枠からの支払いを選んでください。');
 clearOutgoing();await refresh();validateCheckout();const s=snapshot(),recipient=pk($('recipient').value.trim());if(recipient.equals(wallet))throw Error('別の受取人を指定してください。');
 const day=currentDay(chainTime,instance),value=amount($('amount').value,remaining(person,day)),latest=await connection.getLatestBlockhash('confirmed');unchanged(s);
 const tx=new Transaction({feePayer:wallet,recentBlockhash:latest.blockhash}).add(...paymentInstructions(program,config,wallet,recipient,value,day,person.nonce));const message=tx.serializeMessage();
 const signed=await provider.signTransaction(tx);unchanged(s);if(!signed.serializeMessage().equals(message))throw Error('署名時に取引内容が変わりました。');
 validateCheckout();const raw=envelope(signed,program,config);$('outgoing').value=raw;$('copy').disabled=false;
 outgoingInfo={blockhash:signed.recentBlockhash,day,nonce:person.nonce,createdAt:Date.now()};const rev=qrRevision;
 try{const image=await qrImage(raw);unchanged(s);if(rev!==qrRevision)return;setQr('return',image);write('returnExpiry','返送QRは通常約1分で期限切れになります。今、店側に読み取ってもらってください。');}
 catch(e){notice(`支払データは作成済みです。${e.message}`,true);return;}
 notice('店側へ返送QRを見せてください。まだ発行・決済はされていません。');
});
$('copy').onclick=()=>task(async()=>{await navigator.clipboard.writeText($('outgoing').value);notice('支払データをコピーしました。');});
$('incoming').oninput=()=>{invalidate();write('returnImport','貼り付けたデータは「内容を確認」で検証してください。');};
async function validateIncoming(){const s=snapshot();const parsed=inspectPayment($('incoming').value,program,config,wallet);
 const [p,t,valid]=await Promise.all([readPerson(connection,program,config,parsed.consumer),readClock(connection),connection.isBlockhashValid(parsed.tx.recentBlockhash,'confirmed')]);unchanged(s);
 if(!p||p.nonce!==parsed.nonce||parsed.day!==currentDay(t,instance)||parsed.value>remaining(p,parsed.day)||!valid.value)throw Error('この支払いは期限切れ・処理済み・枠不足のいずれかです。支払者に再確認してください。');return parsed;
}
$('inspect').onclick=()=>task(async()=>{invalidate();await assertDevnet(connection);reviewed=await validateIncoming();write('review',`${reviewed.consumer} から ${reviewed.value} クレジットを受け取ります。この受領には生産者側のSOL支払いは含まれません。`);});
$('accept').onclick=()=>task(async()=>{const s=snapshot(),check=await validateIncoming();if(!reviewed||!check.tx.serializeMessage().equals(reviewed.tx.serializeMessage()))throw Error('支払内容をもう一度確認してください。');
 invalidate();const message=check.tx.serializeMessage(),signed=await provider.signTransaction(check.tx);unchanged(s);if(!signed.serializeMessage().equals(message))throw Error('署名時に取引内容が変わりました。');
 await broadcast(signed);$('incoming').value='';write('returnImport','受領が成立しました。');await refresh();notice('受領が成立しました。支払額が消えないWARAとして発行されました。');
});
$('transfer').onclick=()=>task(async()=>{if(usingDaily())throw Error('本トークンでの支払いを選んでください。');await refresh();validateCheckout();const dest=pk($('recipient').value.trim()),value=amount($('amount').value,credit);if(dest.equals(wallet))throw Error('別の支払先を指定してください。');const src=getAssociatedTokenAddressSync(instance.mint,wallet),target=getAssociatedTokenAddressSync(instance.mint,dest);
 await signAndSend([createAssociatedTokenAccountIdempotentInstruction(wallet,target,dest,instance.mint),createTransferCheckedInstruction(src,instance.mint,target,wallet,value,0)],validateCheckout);clearCheckout();notice('WARAで支払いました。店側は「残高を更新」で確認してください。今日の枠は変わりません。');});
function qrContext(){if(!instance)throw Error('循環設定の読み込みを待ってください。');return {program,config,mint:instance.mint};}
function removeQr(prefix){$(prefix+'Qr').removeAttribute('src');$('save'+(prefix==='return'?'Return':'Request')+'Qr').removeAttribute('href');}
function setQr(prefix,url){$(prefix+'Qr').src=url;$(prefix+'Qr').hidden=false;$('save'+(prefix==='return'?'Return':'Request')+'Qr').href=url;$('save'+(prefix==='return'?'Return':'Request')+'Qr').hidden=false;$(prefix+'Card').hidden=false;}
function clearOutgoing(){qrRevision++;outgoingInfo=null;$('outgoing').value='';$('copy').disabled=true;$('returnCard').hidden=true;removeQr('return');}
function expireOutgoing(message){clearOutgoing();$('returnCard').hidden=false;$('returnQr').hidden=true;$('saveReturnQr').hidden=true;write('returnExpiry',message);}
function clearCheckout(){checkoutRequest=null;$('checkoutReview').hidden=true;$('confirmCheckout').checked=false;$('recipient').readOnly=false;$('amount').readOnly=false;$('recipient').value='';$('amount').value='100';clearOutgoing();controls();}
function clearMerchant(){merchantRequest=null;$('requestCard').hidden=true;removeQr('request');}
function resetQR(){scanner.stop();$('qrScanner').close();clearMerchant();clearCheckout();$('incoming').value='';write('returnImport','');}
function validateCheckout(){if(!checkoutRequest)return;parseRequest(JSON.stringify(checkoutRequest),qrContext());
 if(!$('confirmCheckout').checked||$('recipient').value!==checkoutRequest.recipient||$('amount').value!==checkoutRequest.amount)throw Error('QRの宛先と金額をもう一度確認してください。');}
function readQr(raw,kind){
 if(scanGeneration!==generation)throw Error('ウォレットや設定が変わりました。QRを読み直してください。');
 if(kind==='request'){
  clearCheckout();
  const request=parseRequest(raw,qrContext());if(wallet?.equals(pk(request.recipient)))throw Error('自分への支払いはできません。別の店のお会計QRを読んでください。');
  clearOutgoing();checkoutRequest=request;$('recipient').value=request.recipient;$('amount').value=request.amount;$('recipient').readOnly=true;$('amount').readOnly=true;$('confirmCheckout').checked=false;
  write('checkoutSummary',`${request.label||'受取人'}（表示名は未確認）へ ${request.amount} WARA相当。宛先：${request.recipient}。${instance.period===120n?'120秒体験版':'一日循環'}。店頭の相手と金額を確認してください。`);$('checkoutReview').hidden=false;
  notice('お会計QRから宛先と金額が入りました。確認欄にチェックし、支払い方法を選んで署名してください。');
 }else{
  invalidate();$('incoming').value='';write('returnImport','');snapshot();const parsed=inspectReturnQR(raw,program,config,wallet);$('incoming').value=raw;
  write('returnImport',`${parsed.value} の返送QRを読み取りました。まだ未決済です。「内容を確認」で期限と使用状況を確かめてください。`);
  notice('返送QRを読み取りました。店側で内容を確認してから受領に署名してください。');
 }
 $('qrScanner').close();controls();
}
const scanner=createScanner({video:$('qrVideo'),canvas:$('qrCanvas'),onValue:readQr,
 onStatus:message=>{scanning=Boolean($('qrVideo').srcObject)||message.includes('許可を確認');write('scannerStatus',message);controls();},
 onStop:()=>{scanning=false;controls();}});
function startScan(kind){return task(async()=>{scanGeneration=generation;write('scannerTitle',kind==='request'?'店側のお会計QRを読む':'買う人の返送QRを読む');$('qrScanner').showModal();try{await scanner.start(kind);}catch(e){write('scannerStatus',e.message);throw e;}});}
$('scanRequest').onclick=()=>startScan('request');$('scanReturn').onclick=()=>startScan('return');
$('stopScanner').onclick=()=>{$('qrScanner').close();scanner.stop();};$('qrScanner').addEventListener('close',()=>scanner.stop());
document.addEventListener('visibilitychange',()=>{if(document.hidden){scanner.stop();$('qrScanner').close();}});window.addEventListener('pagehide',()=>scanner.stop());
for(const [id,kind] of [['requestFile','request'],['returnFile','return']])$(id).onchange=()=>{const file=$(id).files[0];$(id).value='';task(async()=>{scanGeneration=generation;await scanner.file(file,kind);});};
$('makeRequest').onclick=()=>task(async()=>{const s=snapshot();clearMerchant();const raw=createRequest(qrContext(),wallet,$('requestAmount').value,$('merchantLabel').value),data=parseRequest(raw,qrContext()),image=await qrImage(raw);unchanged(s);merchantRequest=data;setQr('request',image);write('requestSummary',`${data.label||'あなた'}へのお会計：${data.amount} WARA相当 · ${instance.period===120n?'120秒体験版':'一日循環'}`);qrTick();notice('店側のお会計QRを作りました。買う人に読み取ってもらってください。');});
for(const id of ['merchantLabel','requestAmount'])$(id).oninput=clearMerchant;
for(const id of ['recipient','amount'])$(id).oninput=clearOutgoing;
$('clearCheckout').onclick=clearCheckout;$('confirmCheckout').onchange=controls;
function qrTick(){const now=Date.now();if(merchantRequest){const remaining=Math.ceil((merchantRequest.expiresAt-now)/1000);if(remaining<=0){clearMerchant();notice('お会計QRの期限が切れました。新しく作ってください。');}else write('requestExpiry',`お会計QRの残り時間 ${Math.floor(remaining/60)}分${remaining%60}秒`);}
 if(checkoutRequest&&now>=checkoutRequest.expiresAt){write('checkoutSummary','お会計QRの期限が切れました。店側で新しく作ったQRを読み直してください。');$('confirmCheckout').checked=false;}
 if(outgoingInfo&&now-outgoingInfo.createdAt>60_000)write('returnExpiry','署名から1分以上経過しています。店側の「内容を確認」で有効期限を確かめてください。');controls();}
setInterval(()=>{tick();qrTick();},1000);
setInterval(()=>{if(wallet&&instance&&!busy&&!scanning)task(refresh);},20000);
task(async()=>{const response=await fetch('/devnet/deployment.json',{cache:'no-store'});if(!response.ok)throw Error('配備情報を取得できません。');manifest=await response.json();if(manifest.cluster!=='devnet'||manifest.rpc!==RPC)throw Error('Devnet以外の設定を拒否しました。');await selectInstance();});
