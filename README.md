# FEMFEd — Finite Element Method For Education

โปรแกรมจำลองไฟไนต์เอลิเมนต์ (FEM) สำหรับการถ่ายเทความร้อน (heat transfer) เพื่อการศึกษา
เขียนเป็น **ไฟล์ HTML เดี่ยว ๆ ไฟล์เดียว** ทำงานได้แบบออฟไลน์ 100% ไม่มีการส่งหรือบันทึกข้อมูลผู้ใช้ใด ๆ

🔗 **Live demo:** _(จะเพิ่มลิงก์ Vercel หลัง deploy)_

## คุณสมบัติหลัก

- **มิติ**: 1D (เส้น/แท่ง) และ 2D (สี่เหลี่ยม หรือวาดรูปทรงเองแบบ polygon)
- **สมการ**: Heat transfer แบบ steady-state และ transient (time-dependent)
- **Element**: linear (3-node/2-node) และ quadratic (6-node/3-node) triangular/bar elements
- **Solver**: Conjugate Gradient และ Direct (LU decomposition, factorize ครั้งเดียวใช้ซ้ำได้สำหรับ transient)
- **Boundary conditions**: Fixed temperature (Dirichlet), Heat flux (Neumann), Insulated
- **Exact solution comparison**: เทียบผลลัพธ์กับคำตอบปิด (1D closed-form, 2D Fourier series) เมื่อเงื่อนไขเอื้ออำนวย
- **Transient playback**: เล่นผลลัพธ์แบบ time-lapse ที่ 10 fps พร้อม Play/Pause/Restart
- **Contour**: smooth gradient shading (per-pixel barycentric interpolation) พร้อม colorbar มี tick กำกับทุก 10%

## โครงสร้างไฟล์

```
index.html   ← ตัวแอปทั้งหมด (HTML + CSS + JavaScript ในไฟล์เดียว ไม่มี dependency ภายนอก)
README.md    ← ไฟล์นี้
```

โค้ดฝั่ง JavaScript ทั้งหมดอยู่ใน `<script>` เดียวใน `index.html` แบ่งเป็นส่วน ๆ ตามคอมเมนต์ `/* ===... */`:

| ส่วน | หน้าที่ |
|---|---|
| Mesh generation | สร้างเมช 1D bar, 2D rectangle (structured grid), 2D custom polygon (ear-clipping + uniform refinement) |
| FEM solver | ประกอบ stiffness matrix `[K]`, mass matrix `[M]` (HRZ lumped), แก้ระบบสมการ (steady + transient Backward Euler) |
| Exact solution engine | คำตอบปิดสำหรับกรณีที่ลดรูปได้ (1D, รูปสี่เหลี่ยมแบบ Dirichlet ครบ 4 ขอบ) |
| Color map | smooth rainbow gradient (per-pixel ImageData rendering) |
| UI rendering | wizard-style 6 ขั้นตอน: เลือกสมการ → สร้างรูปทรง → คุณสมบัติวัสดุ → เงื่อนไขเริ่มต้น/ขอบเขต → ตีเมช → รันและดูผล |

## พัฒนาต่อ

ไม่ต้อง build step ใด ๆ — แก้ `index.html` แล้วเปิดในเบราว์เซอร์ได้เลย

แนะนำให้ทดสอบด้วย [Playwright](https://playwright.dev/) ก่อน commit ทุกครั้ง โดยเฉพาะส่วน FEM solver ที่ควรตรวจสอบกับคำตอบวิเคราะห์ (analytical solution) หรือคุณสมบัติทางฟิสิกส์ (เช่น maximum principle, energy conservation) ไม่ใช่แค่ว่าโค้ดรันไม่ error

## ข้อจำกัดที่ทราบอยู่แล้ว

- Exact solution comparison ยังไม่รองรับกรณี transient
- Element แบบ quadratic อาจให้ผลลัพธ์ที่เกินขอบเขตทางฟิสิกส์เล็กน้อยในการวิเคราะห์ transient ที่มี time step ละเอียดมาก (คุณสมบัติทางคณิตศาสตร์ของ higher-order element ไม่ใช่บั๊ก) — แนะนำใช้ linear element หากต้องการผลลัพธ์ที่เคารพขอบเขตทางฟิสิกส์อย่างเคร่งครัด
- Structural (elastic) analysis ยังไม่ implement (มีเมนูเตรียมไว้)

## License

_(ยังไม่ได้กำหนด — แจ้งได้ถ้าต้องการเพิ่ม LICENSE file)_
