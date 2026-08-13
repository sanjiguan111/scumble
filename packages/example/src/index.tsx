import { root } from "@lynx-js/react";
import { MemoryRouter, Routes, Route } from "react-router";

import { DemoPage } from "./pages/DemoPage";
import { HomePage } from "./pages/HomePage";

root.render(
  <MemoryRouter>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/demo/:key" element={<DemoPage />} />
    </Routes>
  </MemoryRouter>,
);
