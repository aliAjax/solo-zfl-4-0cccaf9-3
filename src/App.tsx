import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import ChainWorkbench from "@/chain/ChainWorkbench";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chain" element={<ChainWorkbench />} />
      </Routes>
    </Router>
  );
}
