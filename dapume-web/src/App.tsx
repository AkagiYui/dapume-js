/**
 * 应用根组件与路由。
 *
 * 使用哈希路由（HashRouter），便于部署在任意静态托管的子目录下。
 * - "/"           规则与语法（指南页）
 * - "/workbench"  工作台
 */
import { HashRouter, Route } from '@solidjs/router';
import Guide from '~/pages/Guide';
import Workbench from '~/pages/Workbench';

export default function App() {
  return (
    <HashRouter>
      <Route path="/" component={Guide} />
      <Route path="/workbench" component={Workbench} />
    </HashRouter>
  );
}
