import { matchDemoRegex, type DemoRegexRequest } from './demoRegexEngine';
self.onmessage = ({ data }: MessageEvent<DemoRegexRequest>) => {
  self.postMessage(matchDemoRegex(data));
};
export {};
