import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'');
  return {plugins:[react()],resolve:{alias:{'react-native':'react-native-web'}},server:{fs:{allow:['..']},watch:{usePolling:true,interval:500},proxy:{'/api/vision':{target:env.VISION_PROXY_TARGET||'http://127.0.0.1:8780',changeOrigin:true}}}};
});
