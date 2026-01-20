import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Run from './pages/Run';
import Report from './pages/Report';
import Layout from './components/Layout';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/run/:id" element={<Run />} />
        <Route path="/report/:id" element={<Report />} />
      </Routes>
    </Layout>
  );
}
