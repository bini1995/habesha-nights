"use strict";
const sport = document.body.dataset.sport;
const positions = { FOOTBALL: ["QB","RB","WR","TE","K","DST","FLEX"], BASKETBALL: ["PG","SG","SF","PF","C","G","F","UTIL"], SOCCER: ["GK","DEF","MID","FWD"] }[sport];
const defaults = { FOOTBALL: ["QB","RB","WR","TE"], BASKETBALL: ["PG","SG","SF","PF","C"], SOCCER: ["GK","DEF","MID","FWD"] }[sport];
const list = document.querySelector("#player-list"); let currentStep = 1; let sampleOptions = [];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (character) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[character]);
const slug = (value, fallback) => String(value || fallback).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60) || fallback;
function identityReviewMarkup(resolution, storedIdentity) {
  if (resolution?.status === "UNMATCHED") {
    return `<div class="identity-review unmatched"><strong>No player match yet</strong><p>Keep the typed name. Live projections will stay unavailable until this player is linked.</p></div>`;
  }
  if (resolution) {
    const selected=resolution.selectedPlayerId||"";
    const question=resolution.status==="MATCHED"?"Confirm player match":"Which player is this?";
    const prompt=resolution.status==="AMBIGUOUS"?'<option value="">Choose the right player</option>':"";
    const options=resolution.candidates.map(candidate=>`<option value="${escapeHtml(candidate.id)}" ${candidate.id===selected?"selected":""}>${escapeHtml(candidate.name)} · ${escapeHtml(candidate.position)}${candidate.teamLabel?` · ${escapeHtml(candidate.teamLabel)}`:""}</option>`).join("");
    return `<div class="identity-review ${resolution.status.toLowerCase()}"><label>${question}<select class="p-identity" required>${prompt}${options}<option value="__manual__">None of these—keep typed name</option></select></label><p>${resolution.status==="MATCHED"?"We found one clear directory match. Check it before continuing.":"Choose a player or keep the typed name before continuing."}</p></div>`;
  }
  if (storedIdentity) {
    return `<div class="identity-review matched stored-identity"><strong>Player identity linked</strong><p>This link will be removed if you change the name or position.</p></div>`;
  }
  return "";
}
function playerCard(data={}) {
  const card=document.createElement("article");
  const selectedPosition=positions.includes(data.player?.position)
    ? data.player.position
    : "";
  const selectedRole=["STARTER","BENCH"].includes(data.role)
    ? data.role
    : "";
  const extractionConfidence=Number(data.extractionConfidence);
  const confidenceMessage=Number.isFinite(extractionConfidence)
    ? `<p class="scan-confidence">Screenshot read: ${Math.round(extractionConfidence*100)}% confidence. Check this player.</p>`
    : "";
  const identityMessage=identityReviewMarkup(data.identityResolution,data.player?.identity);

  card.className="player-card";
  card.innerHTML=`<label>Player name<input class="p-name" required value="${escapeHtml(data.player?.name||"")}" placeholder="Player name"></label><label>Position<select class="p-position" required>${selectedPosition?"":'<option value="">Choose</option>'}${positions.map(p=>`<option value="${p}" ${p===selectedPosition?"selected":""}>${p}</option>`).join("")}</select></label><label>Lineup role<select class="p-role" required>${selectedRole?"":'<option value="">Choose starter or bench</option>'}<option value="STARTER" ${selectedRole==="STARTER"?"selected":""}>Starting lineup</option><option value="BENCH" ${selectedRole==="BENCH"?"selected":""}>Bench</option></select></label><div class="player-actions" aria-label="Player actions"><button type="button" data-up aria-label="Move player up">↑</button><button type="button" data-down aria-label="Move player down">↓</button><button type="button" data-remove aria-label="Remove player">×</button></div>${confidenceMessage}${identityMessage}<details><summary>More details for a sharper score</summary><div><label>Projected points<input class="p-points" type="number" min="0" max="1000" step="0.1" value="${data.projection?.projectedFantasyPoints??""}"></label><label>Status<select class="p-status">${["ACTIVE","QUESTIONABLE","DOUBTFUL","OUT","UNKNOWN"].map(s=>`<option value="${s}" ${s===(data.player?.status||"ACTIVE")?"selected":""}>${s[0]+s.slice(1).toLowerCase()}</option>`).join("")}</select></label></div></details>`;
  const nameInput=card.querySelector(".p-name");
  const positionInput=card.querySelector(".p-position");
  const identitySelect=card.querySelector(".p-identity");
  let applyingIdentity=false;
  const clearIdentity=()=>{
    delete card.dataset.canonicalPlayerId;
    delete card.dataset.identityMatchMethod;
    delete card.dataset.identityMatchedAt;
    delete card.dataset.identityProviderId;
    delete card.dataset.identityProviderPlayerId;
    delete card.dataset.identitySourceUpdatedAt;
    if(identitySelect)identitySelect.value="__manual__";
    card.querySelector(".stored-identity")?.remove();
  };
  const setIdentity=(candidate,matchMethod,matchedAt,sourceUpdatedAt,updateFields=false)=>{
    if(!candidate)return clearIdentity();
    card.dataset.canonicalPlayerId=candidate.id;
    card.dataset.identityMatchMethod=matchMethod;
    card.dataset.identityMatchedAt=matchedAt;
    card.dataset.identityProviderId=candidate.providerId;
    card.dataset.identityProviderPlayerId=candidate.providerPlayerId;
    card.dataset.identitySourceUpdatedAt=sourceUpdatedAt||"";
    if(updateFields){
      applyingIdentity=true;
      nameInput.value=candidate.name;
      if(positions.includes(candidate.position))positionInput.value=candidate.position;
      applyingIdentity=false;
    }
  };
  if(data.player?.identity){
    setIdentity({
      id:data.player.identity.canonicalPlayerId,
      providerId:data.player.identity.providerId,
      providerPlayerId:data.player.identity.providerPlayerId
    },data.player.identity.matchMethod,data.player.identity.matchedAt,data.player.identity.sourceUpdatedAt);
  }
  if(identitySelect){
    identitySelect.onchange=()=>{
      if(!identitySelect.value||identitySelect.value==="__manual__")return clearIdentity();
      const candidate=data.identityResolution.candidates.find(item=>item.id===identitySelect.value);
      const automatic=data.identityResolution.status==="MATCHED"&&candidate?.id===data.identityResolution.selectedPlayerId;
      setIdentity(candidate,automatic?candidate.matchMethod:"USER_CONFIRMED",data.identityResolvedAt,data.identityProviderUpdatedAt,true);
    };
    if(identitySelect.value)identitySelect.onchange();
  }
  nameInput.addEventListener("input",()=>{if(!applyingIdentity)clearIdentity();});
  positionInput.addEventListener("change",()=>{if(!applyingIdentity)clearIdentity();});
  card.querySelector("[data-remove]").onclick=()=>card.remove();
  card.querySelector("[data-up]").onclick=()=>card.previousElementSibling&&list.insertBefore(card,card.previousElementSibling);
  card.querySelector("[data-down]").onclick=()=>card.nextElementSibling&&list.insertBefore(card.nextElementSibling,card);
  list.append(card);
}
function setStepControlsEnabled(section, enabled) {
  section.querySelectorAll("input, select, textarea, button").forEach((control) => {
    control.disabled = !enabled || control.dataset.alwaysDisabled === "true";
  });
}
function showStep(step){
  currentStep=step;
  document.querySelectorAll(".step").forEach((section)=>{
    const active=Number(section.dataset.step)===step;
    section.hidden=!active;
    setStepControlsEnabled(section,active);
  });
  document.querySelectorAll(".progress span").forEach((el,i)=>el.classList.toggle("active",i+1<=step));
  document.querySelector("#step-error").textContent="";
  if(step===3)review();
  const heading=document.querySelector(`.step[data-step="${step}"] h2`);
  heading?.focus({preventScroll:true});
  document.querySelector(".builder").scrollIntoView({behavior:"smooth",block:"start"});
}
function validateActiveStep(){
  const section=document.querySelector(`.step[data-step="${currentStep}"]`);
  const invalid=[...section.querySelectorAll("input, select, textarea")].find((control)=>!control.checkValidity());
  const error=document.querySelector("#step-error");
  if(!invalid){error.textContent="";return true;}
  error.textContent=currentStep===1
    ? "Add a team name to continue."
    : invalid.classList.contains("p-identity")
      ? "Choose the matching player, or select ‘keep typed name,’ before continuing."
      : "Add a name for each lineup spot, or remove any spot you do not need.";
  invalid.focus({preventScroll:true});
  invalid.scrollIntoView({behavior:"smooth",block:"center"});
  return false;
}
function roster(){return [...list.children].map((card,index)=>{const name=card.querySelector(".p-name").value.trim();const id=card.dataset.canonicalPlayerId||slug(name,`player-${index+1}`);const raw=card.querySelector(".p-points").value;const identity=card.dataset.canonicalPlayerId?{canonicalPlayerId:card.dataset.canonicalPlayerId,matchMethod:card.dataset.identityMatchMethod,matchedAt:card.dataset.identityMatchedAt,providerId:card.dataset.identityProviderId,providerPlayerId:card.dataset.identityProviderPlayerId,sourceUpdatedAt:card.dataset.identitySourceUpdatedAt||null}:null;return {id:`slot-${index+1}`,role:card.querySelector(".p-role").value,player:{id,identity,name,position:card.querySelector(".p-position").value,status:card.querySelector(".p-status").value.toUpperCase()},projection:raw===""?null:{playerId:id,projectedFantasyPoints:Number(raw),source:"USER_SUPPLIED"}};});}
function team(){const name=document.querySelector("#team-name").value.trim();const leagueName=document.querySelector("#league-name").value.trim()||"My League";return{id:`team-${sport.toLowerCase()}-${slug(leagueName,"league")}-${slug(name,"team")}`,name,sport,leagueSettings:{name:leagueName,sport,starterPositions:defaults,scoringLabel:sport==="SOCCER"?"User-supplied projected points":"User-supplied projected fantasy points"},roster:roster()};}
function review(){document.querySelector("#review-list").innerHTML=roster().map(x=>`<div><strong>${escapeHtml(x.player.name||"Unnamed player")}</strong><span>${x.player.position} · ${x.role==="STARTER"?"Starter":"Bench"}</span></div>`).join("");}
function componentLabel(key){return key.replace(/([A-Z])/g," $1").replace(/^./,x=>x.toUpperCase());}
function recommendationTitle(item){if(item.action==="START_PLAYER")return `Start ${item.playerStarted.name}`;return `Add ${item.playerAdded?.name||"player"}`;}
function render(result,teamData){const a=result.analysis,entries=Object.entries(a.components).sort((x,y)=>y[1]-x[1]),strong=entries[0],weak=entries.at(-1),verdict=a.overallScore>=80?"A contender with a strong core":a.overallScore>=65?"Competitive, with room to improve":"A rebuild with clear upside";const recs=result.recommendations.map(r=>`<article class="recommendation"><span class="rank">${r.rank}</span><div><strong>${escapeHtml(recommendationTitle(r))}</strong><p>${escapeHtml(r.reason)}</p><small>${a.dataCompleteness.confidence.toLowerCase()} confidence · based on ${r.dataInputsUsed.map(componentLabel).join(", ")}</small></div><span class="gain">+${r.expectedScoreImprovement}</span></article>`).join("")||"<p>No positive move was found in the options supplied.</p>";const root=document.querySelector("#analysis-results");root.innerHTML=`<div class="result-top"><div class="score-ring" style="--score:${a.overallScore}" role="img" aria-label="Team Score ${a.overallScore} out of 100, grade ${a.letterGrade}"><div><strong>${a.overallScore}</strong><small>Grade ${a.letterGrade}</small></div></div><div class="verdict"><p class="kicker">Your Team Score</p><h2 id="result-title">${verdict}</h2><p>${a.dataCompleteness.confidence} confidence · ${a.dataCompleteness.percentage}% of useful data supplied</p><div class="highlights"><div class="highlight"><small>Strongest area</small><strong>${componentLabel(strong[0])} · ${strong[1]}</strong></div><div class="highlight"><small>Biggest opportunity</small><strong>${componentLabel(weak[0])} · ${weak[1]}</strong></div></div></div></div><div class="components">${Object.entries(a.components).map(([k,v])=>`<div class="component"><span>${componentLabel(k)}</span><strong>${v}</strong><div class="bar"><i style="width:${v}%"></i></div></div>`).join("")}</div><h2>Your next moves</h2><div class="recommendations">${recs}</div>${result.lockedRecommendationCount?`<div class="premium"><strong>${result.lockedRecommendationCount} more ranked move${result.lockedRecommendationCount===1?"":"s"}</strong><p>Premium will unlock every recommendation. Payments are not enabled yet.</p></div>`:""}<div class="share"><button class="primary" id="copy-summary">Copy score summary</button><button class="quiet" id="download-card">Download share card</button></div><div class="share-card" id="share-card"><p>SPORTS HUB · ${sport}</p><strong>${escapeHtml(teamData.name)}</strong><div class="share-score">${a.overallScore}/100 · Grade ${a.letterGrade}</div><span>Strongest: ${componentLabel(strong[0])}</span></div><details class="technical"><summary>How this score was calculated</summary><p>Deterministic Team Score version ${escapeHtml(a.teamScoreVersion)}. Projected fantasy points are kept separate from Team Score. Manager Score and AI ranking are not calculated.</p></details>`;root.hidden=false;document.querySelector("#copy-summary").onclick=async()=>{const text=`${teamData.name} · ${sport} Team Score ${a.overallScore}/100 (Grade ${a.letterGrade}). Strongest area: ${componentLabel(strong[0])}.`;await navigator.clipboard.writeText(text);document.querySelector("#copy-summary").textContent="Copied";};document.querySelector("#download-card").onclick=()=>downloadCard(teamData,a,strong);root.scrollIntoView({behavior:"smooth"});}
function enhanceResults(result){
  const a=result.analysis;
  const details=document.querySelector(".technical");
  details.querySelector("summary").textContent="Score details and confidence";
  details.querySelector("p").textContent=`${a.dataCompleteness.percentage<100?"Add more details for a sharper score. Missing projections are never invented. ":""}${a.dataCompleteness.confidence} confidence · ${a.dataCompleteness.percentage}% completeness · Team Score version ${a.teamScoreVersion}.`;
  document.querySelector(".recommendation-heading")?.remove();
  const heading=[...document.querySelectorAll("#analysis-results h2")].at(-1);
  if(heading)heading.textContent="Your best next move";
  const link=document.createElement("a");link.href=`/sports-hub/${sport.toLowerCase()}/`;link.className="quiet analyze-again";link.textContent="Analyze another team";document.querySelector(".share").append(link);
}
function installCheckIn(result,teamData){
  const panel=document.createElement("section");
  panel.className="check-in-prompt";
  panel.setAttribute("aria-labelledby","check-in-title");
  panel.innerHTML=`<div><p class="kicker">Track your progress</p><h2 id="check-in-title">Save this score as a check-in</h2><p>Come back after lineup, projection, or injury-status changes to see whether your team moved forward.</p></div><div class="check-in-actions"><button class="primary" id="save-check-in" type="button">Save check-in</button><a class="quiet" id="view-history" href="/sports-hub/history/?teamId=${encodeURIComponent(teamData.id)}" hidden>View progress</a></div><p class="check-in-status" id="check-in-status" role="status" aria-live="polite"></p>`;
  const share=document.querySelector(".share");
  share.parentNode.insertBefore(panel,share);
  const button=panel.querySelector("#save-check-in");
  const history=panel.querySelector("#view-history");
  const status=panel.querySelector("#check-in-status");
  button.onclick=async()=>{
    button.disabled=true;
    status.textContent="Saving this score…";
    try{
      const response=await fetch(`/api/sports-hub/teams/${encodeURIComponent(teamData.id)}/check-ins`,{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({analysisId:result.analysisId})
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||"This check-in could not be saved.");
      button.textContent="Check-in saved";
      history.hidden=false;
      status.textContent=body.comparison.summary.join(" ");
    }catch(error){
      button.disabled=false;
      status.textContent=error.message;
    }
  };
}
function downloadCard(t,a,strong){const c=document.createElement("canvas");c.width=1200;c.height=630;const x=c.getContext("2d");x.fillStyle="#07100f";x.fillRect(0,0,c.width,c.height);x.fillStyle=getComputedStyle(document.body).getPropertyValue("--sport");x.fillRect(70,70,14,490);x.fillStyle="#f7f7f2";x.font="bold 34px sans-serif";x.fillText(`SPORTS HUB · ${sport}`,120,145);x.font="bold 62px sans-serif";x.fillText(t.name,120,260);x.font="bold 110px sans-serif";x.fillText(`${a.overallScore}/100`,120,405);x.font="32px sans-serif";x.fillText(`Grade ${a.letterGrade} · Strongest: ${componentLabel(strong[0])}`,120,480);const link=document.createElement("a");link.download="sports-hub-team-score.png";link.href=c.toDataURL("image/png");link.click();}
function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(new Error("That image could not be read."));
    reader.readAsDataURL(file);
  });
}
function scanMarkup() {
  return `<section class="roster-scan" id="roster-scan" aria-labelledby="scan-title"><div class="scan-copy"><p class="kicker">Fastest option</p><h3 id="scan-title">Use a roster screenshot</h3><p>Upload a screenshot or clear photo. We’ll pull out the visible players, then you review every name before anything is saved.</p></div><button class="scan-picker" id="scan-picker" type="button">Choose screenshot</button><input id="scan-file" type="file" accept="image/png,image/jpeg,image/webp" hidden><div class="scan-review" id="scan-review" hidden><img id="scan-preview" alt="Selected roster screenshot preview"><div><strong id="scan-filename"></strong><label class="scan-consent"><input id="scan-consent" type="checkbox"> I agree to send this image to OpenAI to read the roster. Sports Hub will not save the image.</label><button class="primary" id="scan-submit" type="button">Scan my roster</button></div></div><p class="scan-status" id="scan-status" role="status" aria-live="polite"></p></section>`;
}
function extractionProjection(player) {
  if (!Number.isFinite(player.projectedFantasyPoints)) return null;
  return {
    playerId: slug(player.name,"screenshot-player"),
    projectedFantasyPoints: player.projectedFantasyPoints,
    source: "VISIBLE_SCREENSHOT_TEXT"
  };
}
async function resolvePlayerIdentities(extraction) {
  const response=await fetch("/api/sports-hub/player-identities/resolve",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({
      sport,
      players:extraction.players.map(player=>({
        name:player.name,
        position:player.position
      }))
    })
  });
  const body=await response.json();
  if(!response.ok)throw new Error(body.error||"Player matching is temporarily unavailable.");
  return body;
}
function applyRosterExtraction(extraction,identityResolution=null,identityWarning=null) {
  if (extraction.teamName) {
    document.querySelector("#team-name").value=extraction.teamName;
  }
  if (extraction.leagueName) {
    document.querySelector("#league-name").value=extraction.leagueName;
  }
  list.replaceChildren();
  extraction.players.forEach((player,index)=>playerCard({
    extractionConfidence:player.confidence,
    identityProviderUpdatedAt:identityResolution?.provider?.updatedAt,
    identityResolution:identityResolution?.results?.[index],
    identityResolvedAt:identityResolution?.resolvedAt,
    player:{
      name:player.name,
      position:player.position,
      status:player.status
    },
    projection:extractionProjection(player),
    role:player.role
  }));
  sampleOptions=[];
  showStep(2);
  document.querySelector(".scan-result-note")?.remove();
  const message=document.createElement("div");
  message.className="scan-result-note";
  const warnings=extraction.warnings.length
    ? `<ul>${extraction.warnings.map(warning=>`<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
    : "";
  const identitySummary=identityWarning
    ? `<p>${escapeHtml(identityWarning)} You can still review and continue with typed names.</p>`
    : identityResolution
      ? `<p class="identity-summary">${identityResolution.counts.matched} matched · ${identityResolution.counts.ambiguous} ${identityResolution.counts.ambiguous===1?"needs":"need"} a choice · ${identityResolution.counts.unmatched} unmatched. ${identityResolution.provider.live?"Current player directory connected.":"Sample directory only; no live projections were added."}</p>`
      : "";
  message.innerHTML=`<strong>We found ${extraction.players.length} player${extraction.players.length===1?"":"s"}.</strong><p>Check every name, position, and starter/bench choice before continuing. Blank projections will stay blank.</p>${identitySummary}${warnings}`;
  document.querySelector(".step[data-step=\"2\"] h2").after(message);
}
async function installRosterScanner() {
  const formGrid=document.querySelector(".step[data-step=\"1\"] .form-grid");
  formGrid.insertAdjacentHTML("afterend",scanMarkup());
  const picker=document.querySelector("#scan-picker");
  const input=document.querySelector("#scan-file");
  const review=document.querySelector("#scan-review");
  const preview=document.querySelector("#scan-preview");
  const filename=document.querySelector("#scan-filename");
  const consent=document.querySelector("#scan-consent");
  const submit=document.querySelector("#scan-submit");
  const status=document.querySelector("#scan-status");
  let selectedDataUrl=null;
  let configuration;

  try {
    const response=await fetch("/api/sports-hub/roster-images/status");
    configuration=await response.json();
    if(!response.ok||!configuration.enabled){
      picker.dataset.alwaysDisabled="true";
      picker.disabled=true;
      status.textContent="Screenshot scanning is not available on this build yet. You can still add players below.";
      return;
    }
  } catch {
    picker.dataset.alwaysDisabled="true";
    picker.disabled=true;
    status.textContent="Screenshot scanning is temporarily unavailable. You can still add players below.";
    return;
  }

  picker.onclick=()=>input.click();
  input.onchange=async()=>{
    const file=input.files?.[0];
    status.textContent="";
    selectedDataUrl=null;
    review.hidden=true;
    consent.checked=false;
    if(!file)return;
    if(!configuration.supportedTypes.includes(file.type)){
      status.textContent="Choose a PNG, JPEG, or WebP screenshot.";
      return;
    }
    if(file.size>configuration.maxBytes){
      status.textContent="Choose an image that is 6 MB or smaller.";
      return;
    }
    try{
      selectedDataUrl=await readImageFile(file);
      preview.src=selectedDataUrl;
      filename.textContent=file.name||"Roster screenshot";
      review.hidden=false;
      consent.focus({preventScroll:true});
    }catch(error){status.textContent=error.message;}
  };
  submit.onclick=async()=>{
    if(!selectedDataUrl){status.textContent="Choose a roster screenshot first.";return;}
    if(!consent.checked){status.textContent="Confirm the image-processing disclosure to continue.";consent.focus();return;}
    submit.disabled=true;
    picker.disabled=true;
    status.textContent="Reading the visible roster…";
    try{
      const response=await fetch("/api/sports-hub/roster-images/parse",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({consent:true,imageDataUrl:selectedDataUrl,sport})
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||"The roster screenshot could not be read.");
      if(!body.extraction.players.length)throw new Error(body.extraction.warnings[0]||"No readable players were found.");
      let identityResolution=null;
      let identityWarning=null;
      try{
        identityResolution=await resolvePlayerIdentities(body.extraction);
      }catch(error){identityWarning=error.message;}
      applyRosterExtraction(body.extraction,identityResolution,identityWarning);
      selectedDataUrl=null;
      preview.removeAttribute("src");
      input.value="";
      status.textContent="Roster read. Review every player before continuing.";
    }catch(error){status.textContent=error.message;}
    finally{submit.disabled=false;picker.disabled=false;}
  };
}
async function analyze(teamData,options=[]){const saved=await fetch("/api/sports-hub/teams",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(teamData)});const body=await saved.json();if(!saved.ok)throw new Error(body.error||"Team could not be saved.");const response=await fetch(`/api/sports-hub/teams/${encodeURIComponent(body.team.id)}/analyze`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({availablePlayers:options})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Analysis failed.");document.querySelector(".builder").hidden=true;document.querySelector(".progress").hidden=true;document.querySelector(".portal-hero").hidden=true;render(result,body.team);enhanceResults(result);installCheckIn(result,body.team);}
async function loadDemo(run=false){const response=await fetch(`/api/sports-hub/samples/${sport.toLowerCase()}`);const data=await response.json();document.querySelector("#team-name").value=data.name;document.querySelector("#league-name").value=data.leagueSettings.name;list.replaceChildren();data.roster.forEach(playerCard);sampleOptions=data.availablePlayers||[];showStep(3);if(run)await analyze({...data,id:`${data.id}-${Date.now()}`},sampleOptions);}
document.querySelectorAll("[data-next]").forEach(button=>button.onclick=()=>{if(validateActiveStep())showStep(currentStep+1);});document.querySelectorAll("[data-back]").forEach(button=>button.onclick=()=>showStep(currentStep-1));document.querySelector("#add-player").onclick=()=>playerCard({role:"BENCH"});document.querySelector("#builder-form").onsubmit=async(event)=>{event.preventDefault();const error=document.querySelector("#builder-error");error.textContent="";try{await analyze(team(),sampleOptions);sessionStorage.removeItem(`sports-hub-draft-${sport}`);}catch(e){error.textContent=e.message;}};
const draftKey=`sports-hub-draft-${sport}`;
let draft=null;try{draft=JSON.parse(sessionStorage.getItem(draftKey));}catch{}
if(draft?.roster?.length){document.querySelector("#team-name").value=draft.name||"";document.querySelector("#league-name").value=draft.leagueName||"";draft.roster.forEach(playerCard);}else{defaults.forEach((position)=>playerCard({role:"STARTER",player:{position,status:"ACTIVE"}}));}
document.querySelector("#builder-form").addEventListener("input",()=>{sessionStorage.setItem(draftKey,JSON.stringify({name:document.querySelector("#team-name").value,leagueName:document.querySelector("#league-name").value,roster:roster()}));});showStep(1);
installRosterScanner().catch(()=>{
  document.querySelector("#step-error").textContent="Screenshot scanning could not load. You can still add players manually.";
});
if(new URLSearchParams(location.search).get("demo")==="1")loadDemo(true).catch(error=>document.querySelector("#builder-error").textContent=error.message);
if(typeof module!=="undefined")module.exports={escapeHtml,componentLabel};
