/** Report cached optional-dependency readiness without delaying liveness requests. */
export function createHealthProbe(check,{ttl=60000,now=Date.now}={}){
 let pending=false;
 let state={storageReady:false,checking:false,checkedAt:null};
 return {read(){
  if(!pending&&(state.checkedAt===null||now()-state.checkedAt>=ttl)){
   pending=true;state={...state,checking:true};
   void Promise.resolve().then(check).then(
    ()=>{state={storageReady:true,checking:false,checkedAt:now()}},
    ()=>{state={storageReady:false,checking:false,checkedAt:now()}}
   ).finally(()=>{pending=false});
  }
  return {...state};
 }};
}
