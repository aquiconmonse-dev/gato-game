(() => {
"use strict";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const W = 480, H = 800;
const $ = id => document.getElementById(id);

const scoreEl = $("score");
const bestEl = $("best");
const worldEl = $("worldLabel");
const overlay = $("overlay");
const titleEl = $("overlayTitle");
const textEl = $("overlayText");
const startBtn = $("startBtn");
const pauseBtn = $("pauseBtn");
const leftBtn = $("leftBtn");
const rightBtn = $("rightBtn");

const WORLDS = [
  {name:"Tierra",emoji:"🌎",top:"#76c8c0",bottom:"#c9edbd",threshold:0},
  {name:"Cielo",emoji:"☁️",top:"#5da4e8",bottom:"#d1eaff",threshold:80},
  {name:"Espacio",emoji:"🪐",top:"#171d55",bottom:"#59468f",threshold:220},
  {name:"Universo",emoji:"🌌",top:"#210d48",bottom:"#a0449b",threshold:420}
];

const GRAVITY=.42, JUMP=-12.8, MOVE=5.3;
const keys={left:false,right:false};

let state="ready", raf=0, lastTime=0;
let player,platforms,obstacles,particles,stars,clouds,planets;
let cameraY,score=0,best=0,highestY=0;
let worldIndex=0,worldBanner=0;
let plane={x:-160,y:280,speed:1.8};

try {
  best=Number(localStorage.getItem("mabelCatJumpBest"))||0;
} catch {}
bestEl.textContent=best;

const rand=(a,b)=>Math.random()*(b-a)+a;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function worldFor(points){
  let index=0;
  WORLDS.forEach((w,i)=>{
    if(points>=w.threshold) index=i;
  });
  return index;
}

function difficulty(){
  return Math.min(score/500,1);
}

function reset(){
  cameraY=0;
  score=0;
  highestY=590;
  worldIndex=0;
  worldBanner=0;
  particles=[];
  obstacles=[];

  player={
    x:216,y:590,w:48,h:55,
    vx:0,vy:JUMP,rotation:0,
    tail:0,blink:0,blinkTimer:0
  };

  platforms=[{
    x:175,y:680,w:130,h:16,
    type:"normal",dir:1,speed:0
  }];

  for(let i=0;i<8;i++){
    const y=580-i*105;
    platforms.push({
      x:rand(15,W-115),y,w:100,h:16,
      type:i%4===3?"moving":"normal",
      dir:Math.random()<.5?-1:1,
      speed:i%4===3?1:0
    });
  }

  makeDecor();
  scoreEl.textContent="0";
  worldEl.textContent="🌎 Tierra";
}

function makeDecor(){
  stars=Array.from({length:145},()=>({
    x:rand(0,W),y:rand(-9000,1000),
    r:rand(.7,2.3),phase:rand(0,6)
  }));

  clouds=Array.from({length:35},()=>({
    x:rand(-20,W+20),y:rand(-9000,1000),
    scale:rand(.65,1.25)
  }));

  planets=Array.from({length:20},(_,i)=>({
    x:rand(20,W-20),
    y:-300-i*480,
    r:rand(22,55),
    color:["#e99cdb","#8d85dc","#e9b7a4","#77c9dc"][i%4]
  }));

  plane={x:-160,y:280,speed:1.8};
}

function addParticles(x,y,count=10){
  for(let i=0;i<count;i++){
    particles.push({
      x,y,vx:rand(-2.5,2.5),vy:rand(-4,-1),
      life:1,size:rand(2,5)
    });
  }
}

function makeObstacle(y){
  const choices=[
    ["rock","bird"],
    ["balloon","storm","bird"],
    ["meteor","satellite"],
    ["comet","energy","meteor"]
  ][worldIndex];

  const type=choices[Math.floor(Math.random()*choices.length)];

  obstacles.push({
    x:rand(30,W-30),
    y,
    size:type==="satellite"?23:25,
    type,
    vx:(Math.random()<.5?-1:1)*rand(1.1,2+difficulty()*2.5),
    rotation:rand(0,6),
    phase:rand(0,6)
  });
}

function generateWorldObjects(){
  let top=Math.min(...platforms.map(p=>p.y));

  while(top>cameraY-280){
    top-=rand(95,128)+difficulty()*17;

    const prev=platforms.reduce((a,b)=>a.y<b.y?a:b);
    let x=rand(8,W-110);

    if(Math.abs(x-prev.x)>225){
      x=clamp(prev.x+rand(-150,150),5,W-105);
    }

    const moving=Math.random()<.13+difficulty()*.38;

    platforms.push({
      x,y:top,w:96-difficulty()*9,h:16,
      type:moving?"moving":"normal",
      dir:Math.random()<.5?-1:1,
      speed:moving?rand(1,1.8+difficulty()*1.8):0
    });

    const chance=score<35?0:Math.min(.2+score/1000,.72);

    if(Math.random()<chance){
      makeObstacle(top-rand(35,80));
    }
  }

  platforms=platforms.filter(p=>p.y-cameraY<H+120);
  obstacles=obstacles.filter(o=>o.y-cameraY<H+100);
}

/* TRANSICIONES DE COLOR */

function hexToRgb(hex){
  const n=parseInt(hex.replace("#",""),16);
  return {
    r:(n>>16)&255,
    g:(n>>8)&255,
    b:n&255
  };
}

function mixColor(a,b,t){
  const A=hexToRgb(a),B=hexToRgb(b);
  t=clamp(t,0,1);

  const r=Math.round(A.r+(B.r-A.r)*t);
  const g=Math.round(A.g+(B.g-A.g)*t);
  const bl=Math.round(A.b+(B.b-A.b)*t);

  return `rgb(${r},${g},${bl})`;
}

/*
 La transición empieza 60 puntos antes
 de llegar al siguiente mundo.
*/

function getWorldBlend(){
  const from=worldIndex;
  const to=Math.min(from+1,WORLDS.length-1);

  if(to===from){
    return {from,to,amount:0};
  }

  const threshold=WORLDS[to].threshold;
  const amount=clamp((score-(threshold-60))/60,0,1);

  return {from,to,amount};
}

function drawCloud(x,y,scale,alpha=.82){
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(scale,scale);
  ctx.globalAlpha=alpha;
  ctx.fillStyle="#fff";

  ctx.beginPath();
  ctx.arc(-25,8,24,0,Math.PI*2);
  ctx.arc(0,-5,33,0,Math.PI*2);
  ctx.arc(30,8,24,0,Math.PI*2);
  ctx.arc(3,17,27,0,Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function drawEarth(){
  ctx.fillStyle="#6d9f78";
  ctx.beginPath();
  ctx.moveTo(0,690);

  for(let x=0;x<=W+50;x+=45){
    ctx.lineTo(
      x,
      650+Math.sin(x*.018)*30-cameraY*.12
    );
  }

  ctx.lineTo(W,H);
  ctx.lineTo(0,H);
  ctx.closePath();
  ctx.fill();

  for(let i=0;i<7;i++){
    const x=(i*83+24)%W;
    const y=675+(i%3)*35-cameraY*.1;

    ctx.fillStyle="#8a6653";
    ctx.fillRect(x-4,y,8,30);

    ctx.fillStyle=i%2?"#4c9a69":"#70b77c";
    ctx.beginPath();
    ctx.arc(x,y-7,19,0,Math.PI*2);
    ctx.fill();
  }

  for(let i=0;i<8;i++){
    const x=(i*61+15)%W;
    const y=720+(i%2)*30-cameraY*.08;

    ctx.fillStyle="#fff0a8";
    ctx.beginPath();
    ctx.arc(x,y,4,0,Math.PI*2);
    ctx.fill();

    ctx.fillStyle="#f39acb";
    ctx.beginPath();
    ctx.arc(x+5,y+2,3,0,Math.PI*2);
    ctx.fill();
  }
}

function drawPlane(){
  plane.x+=plane.speed;

  if(plane.x>W+180) plane.x=-180;

  const y=plane.y-cameraY*.35;

  ctx.save();
  ctx.translate(plane.x,y);
  ctx.scale(.8,.8);

  ctx.fillStyle="#fff8ff";
  ctx.beginPath();
  ctx.ellipse(0,0,62,12,0,0,Math.PI*2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(48,-4);
  ctx.lineTo(82,0);
  ctx.lineTo(48,5);
  ctx.fill();

  ctx.fillStyle="#f2a0d0";
  ctx.beginPath();
  ctx.moveTo(-5,0);
  ctx.lineTo(18,-32);
  ctx.lineTo(35,-27);
  ctx.lineTo(19,2);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-5,0);
  ctx.lineTo(18,29);
  ctx.lineTo(35,25);
  ctx.lineTo(19,-2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle="#91c6e9";

  for(let i=0;i<5;i++){
    ctx.beginPath();
    ctx.arc(-27+i*12,-2,4,0,Math.PI*2);
    ctx.fill();
  }

  ctx.restore();
}

function drawSpace(){
  for(const p of planets){
    const y=p.y-cameraY*.48;
    if(y<-100||y>H+100) continue;

    ctx.fillStyle=p.color;
    ctx.globalAlpha=.78;
    ctx.beginPath();
    ctx.arc(p.x,y,p.r,0,Math.PI*2);
    ctx.fill();

    ctx.strokeStyle="rgba(255,255,255,.65)";
    ctx.lineWidth=4;
    ctx.beginPath();
    ctx.ellipse(p.x,y,p.r*1.45,p.r*.36,-.3,0,Math.PI*2);
    ctx.stroke();
    ctx.globalAlpha=1;
  }

  if(worldIndex===3){
    for(let i=0;i<6;i++){
      const y=(i*170-cameraY*.2)%H;
      ctx.globalAlpha=.12;
      ctx.fillStyle=i%2?"#ff8cdb":"#8c83ff";
      ctx.beginPath();
      ctx.ellipse((i*107+40)%W,y,105,42,.4,0,Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha=1;
  }
}

function roundRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.roundRect(x,y,w,h,r);
}

function drawBackground(){
  const blend=getWorldBlend();
  const from=WORLDS[blend.from];
  const to=WORLDS[blend.to];
  const t=blend.amount;

  // Degradado de color entre ambos mundos.
  const gradient=ctx.createLinearGradient(0,0,0,H);
  gradient.addColorStop(0,mixColor(from.top,to.top,t));
  gradient.addColorStop(1,mixColor(from.bottom,to.bottom,t));

  ctx.fillStyle=gradient;
  ctx.fillRect(0,0,W,H);

  // Estrellas: se van haciendo visibles.
  const starOpacity=blend.from>=2?0.87:.22+t*.65;

  for(const s of stars){
    const factor=blend.from>=2?.7:.2+t*.5;
    const y=((s.y-cameraY*factor)%H+H)%H;

    ctx.globalAlpha=starOpacity*(
      .35+(Math.sin(performance.now()*.002+s.phase)+1)*.25
    );

    ctx.fillStyle="#fff";
    ctx.beginPath();
    ctx.arc(s.x,y,s.r,0,Math.PI*2);
    ctx.fill();
  }

  ctx.globalAlpha=1;

  // Paisajes con entrada y salida gradual.
  const earthOpacity=blend.from===0?1-t:0;
  const skyOpacity=blend.from===1?1:(blend.to===1?t:0);
  const spaceOpacity=blend.from>=2?1:(blend.to>=2?t:0);

  if(earthOpacity>0){
    ctx.save();
    ctx.globalAlpha=earthOpacity;
    drawEarth();
    ctx.restore();
  }

  if(skyOpacity>0){
    ctx.save();
    ctx.globalAlpha=skyOpacity;

    for(const c of clouds){
      const y=((c.y-cameraY*.38)%(H+140)+H+140)%(H+140)-70;
      drawCloud(c.x,y,c.scale,.72);
    }

    if(blend.from===1||blend.to===1){
      drawPlane();
    }

    ctx.restore();
  }

  if(spaceOpacity>0){
    ctx.save();
    ctx.globalAlpha=spaceOpacity;
    drawSpace();
    ctx.restore();
  }

  const label=t<.5?from:to;

  ctx.save();
  ctx.font="900 17px Nunito";
  ctx.textAlign="center";
  ctx.fillStyle="white";
  ctx.shadowColor="#34214f";
  ctx.shadowBlur=8;
  ctx.fillText(
    `${label.emoji} ${label.name.toUpperCase()}`,
    W/2,70
  );
  ctx.restore();

  if(worldBanner>0){
    worldBanner--;

    ctx.save();
    ctx.globalAlpha=Math.min(1,worldBanner/30);
    ctx.fillStyle="rgba(48,32,78,.78)";
    roundRect(52,310,376,116,23);
    ctx.fill();

    ctx.fillStyle="white";
    ctx.textAlign="center";
    ctx.font="900 19px Nunito";
    ctx.fillText("¡NUEVO MUNDO!",W/2,350);

    ctx.font="900 31px Nunito";
    ctx.fillText(
      `${WORLDS[worldIndex].emoji} ${WORLDS[worldIndex].name.toUpperCase()}`,
      W/2,393
    );
    ctx.restore();
  }
}

function drawPlatform(p){
  const x=p.x,y=p.y-cameraY;

  ctx.fillStyle="rgba(45,30,70,.28)";
  roundRect(x,y+7,p.w,13,8);
  ctx.fill();

  const g=ctx.createLinearGradient(x,y,x,y+17);

  if(p.type==="moving"){
    g.addColorStop(0,"#b5f5e6");
    g.addColorStop(1,"#4bb9a7");
  }else{
    g.addColorStop(0,"#ffe1f2");
    g.addColorStop(1,"#d98cc4");
  }

  ctx.fillStyle=g;
  roundRect(x,y,p.w,16,8);
  ctx.fill();

  ctx.fillStyle="rgba(255,255,255,.75)";
  roundRect(x+5,y+2,p.w-10,4,3);
  ctx.fill();
}

function drawObstacle(o){
  const x=o.x,y=o.y-cameraY,s=o.size;

  ctx.save();
  ctx.translate(x,y);

  if(o.type==="rock"){
    ctx.fillStyle="#75665e";
    ctx.beginPath();
    ctx.moveTo(-s,s*.5);
    ctx.lineTo(-s*.8,-s*.4);
    ctx.lineTo(-s*.1,-s);
    ctx.lineTo(s*.7,-s*.6);
    ctx.lineTo(s,s*.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle="#b3a091";
    ctx.beginPath();
    ctx.arc(-5,-5,5,0,Math.PI*2);
    ctx.fill();

  }else if(o.type==="bird"){
    ctx.fillStyle="#51456d";
    ctx.beginPath();
    ctx.ellipse(0,0,s,s*.55,0,0,Math.PI*2);
    ctx.fill();

    const flap=Math.sin(performance.now()*.012+o.phase)*10;
    ctx.strokeStyle="#51456d";
    ctx.lineWidth=6;

    ctx.beginPath();
    ctx.moveTo(-5,0);
    ctx.quadraticCurveTo(-14,-flap-8,-s,-flap);
    ctx.moveTo(5,0);
    ctx.quadraticCurveTo(14,-flap-8,s,-flap);
    ctx.stroke();

    ctx.fillStyle="#ffcf76";
    ctx.beginPath();
    ctx.arc(7,-3,3,0,Math.PI*2);
    ctx.fill();

  }else if(o.type==="balloon"){
    ctx.fillStyle="#ff85bd";
    ctx.beginPath();
    ctx.ellipse(0,-5,s*.75,s,0,0,Math.PI*2);
    ctx.fill();

    ctx.strokeStyle="white";
    ctx.beginPath();
    ctx.moveTo(0,s-5);
    ctx.lineTo(0,s+18);
    ctx.stroke();

  }else if(o.type==="storm"){
    ctx.fillStyle="#68698f";
    ctx.beginPath();
    ctx.arc(-13,4,15,0,Math.PI*2);
    ctx.arc(0,-7,20,0,Math.PI*2);
    ctx.arc(15,4,15,0,Math.PI*2);
    ctx.fill();

    ctx.strokeStyle="#ffe78c";
    ctx.lineWidth=5;
    ctx.beginPath();
    ctx.moveTo(4,10);
    ctx.lineTo(-5,23);
    ctx.lineTo(5,23);
    ctx.lineTo(-2,34);
    ctx.stroke();

  }else if(o.type==="meteor"){
    ctx.rotate(o.rotation);
    ctx.fillStyle="#e97964";
    ctx.beginPath();
    ctx.arc(0,0,s,0,Math.PI*2);
    ctx.fill();

    ctx.fillStyle="#ffba83";
    ctx.beginPath();
    ctx.arc(-7,-7,7,0,Math.PI*2);
    ctx.fill();

  }else if(o.type==="satellite"){
    ctx.fillStyle="#d9d6f7";
    ctx.fillRect(-8,-8,16,16);
    ctx.fillStyle="#68b9e9";
    ctx.fillRect(-s-12,-9,12,18);
    ctx.fillRect(s,-9,12,18);

  }else if(o.type==="comet"){
    ctx.rotate(o.rotation);
    ctx.strokeStyle="#ff9bd7";
    ctx.lineWidth=12;
    ctx.beginPath();
    ctx.moveTo(-s*2,s*1.5);
    ctx.lineTo(0,0);
    ctx.stroke();

    ctx.fillStyle="#fff4ce";
    ctx.beginPath();
    ctx.arc(0,0,s*.65,0,Math.PI*2);
    ctx.fill();

  }else{
    ctx.fillStyle="#a5f1ff";
    ctx.shadowColor="#e8a5ff";
    ctx.shadowBlur=20;
    ctx.beginPath();
    ctx.moveTo(0,-s*1.5);
    ctx.lineTo(s,0);
    ctx.lineTo(0,s*1.5);
    ctx.lineTo(-s,0);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawCat(){
  const x=player.x+player.w/2;
  const y=player.y-cameraY+player.h/2;

  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(player.rotation);

  // Cola
  ctx.strokeStyle="#fff0f7";
  ctx.lineWidth=9;
  ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(-13,17);
  ctx.bezierCurveTo(
    -37,20+Math.sin(player.tail)*5,
    -45,-15,
    -27,-24+Math.sin(player.tail)*6
  );
  ctx.stroke();

  // Orejas
  ctx.fillStyle="#fff3f9";
  ctx.beginPath();
  ctx.moveTo(-20,-14);
  ctx.lineTo(-28,-45);
  ctx.lineTo(-5,-28);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(20,-14);
  ctx.lineTo(28,-45);
  ctx.lineTo(5,-28);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle="#ffacd9";
  ctx.beginPath();
  ctx.moveTo(-20,-25);
  ctx.lineTo(-24,-40);
  ctx.lineTo(-11,-28);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(20,-25);
  ctx.lineTo(24,-40);
  ctx.lineTo(11,-28);
  ctx.closePath();
  ctx.fill();

  // Cuerpo y cabeza
  ctx.fillStyle="#fff0f8";
  ctx.beginPath();
  ctx.ellipse(0,14,23,25,0,0,Math.PI*2);
  ctx.fill();

  ctx.fillStyle="#fffaff";
  ctx.beginPath();
  ctx.ellipse(0,-13,28,26,0,0,Math.PI*2);
  ctx.fill();

  // Patitas
  ctx.fillStyle="#fff0f8";
  ctx.beginPath();
  ctx.ellipse(-14,34,10,7,-.2,0,Math.PI*2);
  ctx.ellipse(14,34,10,7,.2,0,Math.PI*2);
  ctx.fill();

  // Mejillas
  ctx.fillStyle="#ffb4d9";
  ctx.beginPath();
  ctx.ellipse(-17,-7,6,4,0,0,Math.PI*2);
  ctx.ellipse(17,-7,6,4,0,0,Math.PI*2);
  ctx.fill();

  // Ojos
  ctx.fillStyle="#51406f";
  ctx.beginPath();
  ctx.ellipse(-10,-13,4.2,6.5,0,0,Math.PI*2);
  ctx.ellipse(10,-13,4.2,6.5,0,0,Math.PI*2);
  ctx.fill();

  ctx.fillStyle="white";
  ctx.beginPath();
  ctx.arc(-11,-16,1.8,0,Math.PI*2);
  ctx.arc(9,-16,1.8,0,Math.PI*2);
  ctx.fill();

  // Nariz y boca
  ctx.fillStyle="#ee85b9";
  ctx.beginPath();
  ctx.moveTo(-3,-4);
  ctx.lineTo(3,-4);
  ctx.lineTo(0,-1);
  ctx.fill();

  ctx.strokeStyle="#a76c8f";
  ctx.lineWidth=1.7;
  ctx.beginPath();
  ctx.moveTo(0,-1);
  ctx.quadraticCurveTo(-1,4,-5,2);
  ctx.moveTo(0,-1);
  ctx.quadraticCurveTo(1,4,5,2);
  ctx.stroke();

  // Lazo rosa
  ctx.fillStyle="#ff80bd";
  ctx.beginPath();
  ctx.ellipse(0,-37,7,5,.4,0,Math.PI*2);
  ctx.ellipse(9,-37,7,5,-.4,0,Math.PI*2);
  ctx.fill();

  ctx.fillStyle="#ffcae6";
  ctx.beginPath();
  ctx.arc(4.5,-37,3,0,Math.PI*2);
  ctx.fill();

  ctx.restore();
}

/* MOVIMIENTO Y FÍSICA */

function update(dt){
  const oldBottom=player.y+player.h;

  player.vx=(keys.right?MOVE:0)-(keys.left?MOVE:0);
  player.x+=player.vx*dt;

  if(player.x>W) player.x=-player.w;
  if(player.x+player.w<0) player.x=W;

  player.vy+=GRAVITY*dt;
  player.y+=player.vy*dt;

  player.rotation=(player.rotation+player.vx*.002*dt)*.94;
  player.tail+=.12*dt;

  player.blinkTimer+=dt;
  if(player.blinkTimer>145){
    player.blink=1;
    player.blinkTimer=0;
  }else{
    player.blink=0;
  }

  // Saltar al tocar una plataforma desde arriba.
  if(player.vy>0){
    const bottom=player.y+player.h;

    for(const p of platforms){
      const overlapX=
        player.x+player.w-8>p.x &&
        player.x+8<p.x+p.w;

      if(overlapX&&oldBottom<=p.y&&bottom>=p.y){
        player.y=p.y-player.h;
        player.vy=JUMP;
        addParticles(player.x+player.w/2,p.y);
        break;
      }
    }
  }

  // Cámara que sigue al gatito.
  const target=player.y-H*.42;

  if(target<cameraY){
    cameraY+=(target-cameraY)*Math.min(.14*dt,1);
  }

  highestY=Math.min(highestY,player.y);
  score=Math.max(0,Math.floor((590-highestY)/10));
  scoreEl.textContent=score;

  // Desbloquear mundos.
  const nextWorld=worldFor(score);

  if(nextWorld!==worldIndex){
    worldIndex=nextWorld;
    worldBanner=180;

    worldEl.textContent=
      `${WORLDS[worldIndex].emoji} ${WORLDS[worldIndex].name}`;

    if(worldIndex===1){
      plane.x=-160;
      plane.y=cameraY*.35+270;
    }

    addParticles(rand(60,W-60),cameraY+350,30);
  }

  // Plataformas móviles.
  for(const p of platforms){
    if(p.type==="moving"){
      p.x+=p.speed*p.dir*dt;

      if(p.x<0||p.x+p.w>W){
        p.dir*=-1;
        p.x=clamp(p.x,0,W-p.w);
      }
    }
  }

  // Obstáculos móviles.
  for(const o of obstacles){
    o.x+=o.vx*dt;
    o.rotation+=.025*dt;

    if(o.x<o.size||o.x>W-o.size){
      o.vx*=-1;
    }
  }

  // Colisiones con obstáculos.
  const px=player.x+9;
  const py=player.y+8;
  const pw=player.w-18;
  const ph=player.h-13;

  for(const o of obstacles){
    const r=o.size*.68;
    const cx=clamp(o.x,px,px+pw);
    const cy=clamp(o.y,py,py+ph);

    if((o.x-cx)**2+(o.y-cy)**2<r*r){
      finish("obstacle");
      return;
    }
  }

  generateWorldObjects();

  for(const p of particles){
    p.x+=p.vx*dt;
    p.y+=p.vy*dt;
    p.vy+=.12*dt;
    p.life-=.025*dt;
  }

  particles=particles.filter(p=>p.life>0);

  if(player.y-cameraY>H+85){
    finish("fall");
  }
}

function draw(){
  drawBackground();
  platforms.forEach(drawPlatform);
  obstacles.forEach(drawObstacle);

  for(const p of particles){
    ctx.globalAlpha=p.life;
    ctx.fillStyle="#ffe5fa";
    ctx.beginPath();
    ctx.arc(p.x,p.y-cameraY,p.size,0,Math.PI*2);
    ctx.fill();
  }

  ctx.globalAlpha=1;
  drawCat();
}

function finish(reason){
  if(state!=="playing") return;

  state="over";

  if(score>best){
    best=score;
    bestEl.textContent=best;

    try{
      localStorage.setItem("mabelCatJumpBest",String(best));
    }catch{}
  }

  titleEl.textContent=
    reason==="obstacle"?"¡Cuidado! 💥":"¡Oh, no! 🥺";

  textEl.textContent=reason==="obstacle"
    ?`Un obstáculo atrapó al gatito. Hiciste ${score} puntos.`
    :`El gatito cayó. Hiciste ${score} puntos. ¡Inténtalo otra vez!`;

  startBtn.textContent="VOLVER A JUGAR ✨";
  overlay.classList.remove("hidden");
  pauseBtn.disabled=true;
}

function loop(time){
  if(state!=="playing") return;

  const dt=Math.min((time-lastTime)/16.667,2);
  lastTime=time;

  update(dt);
  draw();

  if(state==="playing"){
    raf=requestAnimationFrame(loop);
  }
}

function start(){
  cancelAnimationFrame(raf);
  reset();

  state="playing";
  overlay.classList.add("hidden");
  pauseBtn.disabled=false;
  pauseBtn.textContent="Ⅱ";

  lastTime=performance.now();
  raf=requestAnimationFrame(loop);
}

function togglePause(){
  if(state==="playing"){
    state="paused";
    titleEl.textContent="Pausa 🌸";
    textEl.textContent="El gatito está descansando un ratito.";
    startBtn.textContent="CONTINUAR";
    overlay.classList.remove("hidden");
    pauseBtn.textContent="▶";
    cancelAnimationFrame(raf);

  }else if(state==="paused"){
    state="playing";
    overlay.classList.add("hidden");
    pauseBtn.textContent="Ⅱ";
    lastTime=performance.now();
    raf=requestAnimationFrame(loop);
  }
}

/* CONTROLES DE PC Y CELULAR */

function setButton(button,key){
  const down=e=>{
    e.preventDefault();
    keys[key]=true;
    button.classList.add("active");
  };

  const up=e=>{
    if(e)e.preventDefault();
    keys[key]=false;
    button.classList.remove("active");
  };

  button.addEventListener("pointerdown",down);
  button.addEventListener("pointerup",up);
  button.addEventListener("pointercancel",up);
  button.addEventListener("lostpointercapture",up);
}

setButton(leftBtn,"left");
setButton(rightBtn,"right");

let canvasTouch=false;

canvas.addEventListener("pointerdown",e=>{
  if(state!=="playing") return;
  canvasTouch=true;
  canvas.setPointerCapture(e.pointerId);
  moveTouch(e);
});

canvas.addEventListener("pointermove",e=>{
  if(canvasTouch) moveTouch(e);
});

function moveTouch(e){
  const rect=canvas.getBoundingClientRect();
  const x=(e.clientX-rect.left)/rect.width;

  keys.left=x<.5;
  keys.right=x>=.5;
}

function stopTouch(){
  canvasTouch=false;
  keys.left=false;
  keys.right=false;
}

canvas.addEventListener("pointerup",stopTouch);
canvas.addEventListener("pointercancel",stopTouch);

window.addEventListener("keydown",e=>{
  if(["ArrowLeft","ArrowRight"," "].includes(e.key)){
    e.preventDefault();
  }

  if(e.key==="ArrowLeft"||e.key.toLowerCase()==="a"){
    keys.left=true;
  }

  if(e.key==="ArrowRight"||e.key.toLowerCase()==="d"){
    keys.right=true;
  }

  if(e.key==="Escape"&&(state==="playing"||state==="paused")){
    togglePause();
  }
});

window.addEventListener("keyup",e=>{
  if(e.key==="ArrowLeft"||e.key.toLowerCase()==="a"){
    keys.left=false;
  }

  if(e.key==="ArrowRight"||e.key.toLowerCase()==="d"){
    keys.right=false;
  }
});

window.addEventListener("blur",()=>{
  keys.left=false;
  keys.right=false;

  if(state==="playing"){
    togglePause();
  }
});

startBtn.addEventListener("click",()=>{
  if(state==="paused"){
    togglePause();
  }else{
    start();
  }
});

pauseBtn.addEventListener("click",togglePause);

// Primera pantalla.
reset();
draw();

})();