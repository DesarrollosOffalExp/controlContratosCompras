import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ContratosService } from '../../core/contratos.service';
import { ProveedoresService } from '../../core/proveedores.service';
import { Contrato, Proveedor, Sector } from '../../core/models';

type Metrica = 'monto' | 'cantidad';

interface Segmento {
  label: string;
  valor: number;
  color: string;
  dash: number;
  offset: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="dash">
      <!-- ===== Menú lateral de filtros ===== -->
      <aside class="filtros">
        <div class="filtros-head">
          <span><i class="bi bi-funnel-fill me-2"></i>Filtros</span>
          @if (hayFiltros()) {
            <button class="btn-limpiar" (click)="limpiar()">Limpiar</button>
          }
        </div>

        <div class="fg">
          <label>Buscar</label>
          <div class="buscar">
            <i class="bi bi-search"></i>
            <input type="text" placeholder="N°, título o proveedor…"
                   [ngModel]="buscar()" (ngModelChange)="buscar.set($event)">
          </div>
        </div>

        <div class="fg">
          <label>Estado</label>
          <div class="chips">
            @for (e of estados; track e.valor) {
              <button class="chip" [class.on]="estadoSel().has(e.valor)"
                      [style.--c]="e.color" (click)="toggleEstado(e.valor)">
                <span class="dot"></span>{{ e.label }}
              </button>
            }
          </div>
        </div>

        <div class="fg">
          <label>Vence en</label>
          <div class="chips">
            @for (d of ventanas; track d) {
              <button class="chip" [class.on]="venceEnDias() === d"
                      (click)="venceEnDias.set(venceEnDias() === d ? null : d)">
                {{ d }} días
              </button>
            }
          </div>
        </div>

        <div class="fg">
          <label>Sector</label>
          <select [ngModel]="sectorSel()" (ngModelChange)="sectorSel.set($event)">
            <option value="">Todos los sectores</option>
            @for (s of sectores(); track s.id) {
              <option [value]="s.nombre">{{ s.nombre }}</option>
            }
          </select>
        </div>

        <div class="fg">
          <label>Proveedor</label>
          <select [ngModel]="proveedorSel()" (ngModelChange)="proveedorSel.set(+$event)">
            <option [ngValue]="0">Todos los proveedores</option>
            @for (p of proveedores(); track p.id) {
              <option [ngValue]="p.id">{{ p.razon_social }}</option>
            }
          </select>
        </div>

        <div class="fg">
          <label>Tipo</label>
          <select [ngModel]="tipoSel()" (ngModelChange)="tipoSel.set($event)">
            <option value="">Todos los tipos</option>
            @for (t of tipos; track t) {
              <option [value]="t">{{ t | titlecase }}</option>
            }
          </select>
        </div>

        <div class="fg">
          <label>Moneda</label>
          <select [ngModel]="monedaSel()" (ngModelChange)="monedaSel.set($event)">
            <option value="">Todas las monedas</option>
            @for (m of monedas(); track m) {
              <option [value]="m">{{ m }}</option>
            }
          </select>
        </div>

        <div class="filtros-foot">
          {{ filtrados().length }} de {{ todos().length }} contratos
        </div>
      </aside>

      <!-- ===== Contenido ===== -->
      <section class="contenido">
        <header class="head">
          <div>
            <h2>Panel de Contratos</h2>
            <p>Estado de la cartera, vencimientos y montos comprometidos.</p>
          </div>
          <div class="acciones">
            <button type="button" class="btn-exp" (click)="exportarExcel()"
                    [disabled]="filtrados().length === 0"
                    title="Descarga los contratos filtrados para abrir en Excel">
              <i class="bi bi-file-earmark-spreadsheet me-1"></i>Excel
            </button>
            <button type="button" class="btn-exp" (click)="exportarPdf()"
                    title="Abre el diálogo de impresión: elegí «Guardar como PDF»">
              <i class="bi bi-file-earmark-pdf me-1"></i>PDF
            </button>
            <a routerLink="/contratos/nuevo" class="btn-nuevo">
              <i class="bi bi-plus-lg me-1"></i>Nuevo contrato
            </a>
          </div>
        </header>

        @if (cargando()) {
          <div class="loading"><div class="spinner-border" style="color: var(--red)"></div></div>
        } @else {
          <!-- KPIs -->
          <div class="kpis">
            @for (k of kpis(); track k.label) {
              <div class="kpi" [style.--c]="k.color">
                <div class="kpi-top">
                  <span class="kpi-label">{{ k.label }}</span>
                  <span class="kpi-icon"><i class="bi" [ngClass]="k.icon"></i></span>
                </div>
                <div class="kpi-valor">{{ k.valor }}</div>
                <div class="kpi-sub">{{ k.sub }}</div>
                <svg class="spark" viewBox="0 0 100 30" preserveAspectRatio="none">
                  <path [attr.d]="k.area" class="spark-area"></path>
                  <path [attr.d]="k.linea" class="spark-line"></path>
                </svg>
              </div>
            }
          </div>

          <!-- Gráficos -->
          <div class="grid2">
            <!-- Área -->
            <div class="card">
              <div class="card-head">
                <div>
                  <h3>Evolución de contratos</h3>
                  <p>{{ metrica() === 'monto' ? 'Monto contratado' : 'Cantidad' }} por mes de inicio</p>
                </div>
                <div class="toggle">
                  <button [class.on]="metrica() === 'monto'" (click)="metrica.set('monto')">Monto</button>
                  <button [class.on]="metrica() === 'cantidad'" (click)="metrica.set('cantidad')">Cantidad</button>
                </div>
              </div>
              @if (serie().puntos.length > 0) {
                <svg class="area-chart" viewBox="0 0 760 300" preserveAspectRatio="none">
                  @for (g of serie().gridY; track g.y) {
                    <line class="grid" x1="70" [attr.y1]="g.y" x2="750" [attr.y2]="g.y"></line>
                    <text class="axis-y" x="60" [attr.y]="g.y + 4">{{ g.etq }}</text>
                  }
                  <path [attr.d]="serie().area" class="area-fill"></path>
                  <path [attr.d]="serie().linea" class="area-line"></path>
                  @for (p of serie().puntos; track p.x) {
                    <circle class="area-pt" [attr.cx]="p.x" [attr.cy]="p.y" r="3.5">
                      <title>{{ p.etq }}: {{ p.tip }}</title>
                    </circle>
                    <text class="axis-x" [attr.x]="p.x" y="292">{{ p.mesCorto }}</text>
                  }
                </svg>
              } @else {
                <p class="vacio">Sin datos para los filtros seleccionados.</p>
              }
            </div>

            <!-- Donut por estado -->
            <div class="card">
              <div class="card-head">
                <div>
                  <h3>Por estado</h3>
                  <p>{{ filtrados().length }} contratos</p>
                </div>
              </div>
              @if (donut().length > 0) {
                <div class="donut-wrap">
                  <svg class="donut" viewBox="0 0 180 180">
                    <circle class="donut-bg" cx="90" cy="90" r="70"></circle>
                    @for (s of donut(); track s.label) {
                      <circle class="donut-seg" cx="90" cy="90" r="70"
                              [style.stroke]="s.color"
                              [attr.stroke-dasharray]="s.dash + ' ' + (donutCirc - s.dash)"
                              [attr.stroke-dashoffset]="s.offset">
                        <title>{{ s.label }}: {{ s.valor }}</title>
                      </circle>
                    }
                    <text class="donut-num" x="90" y="86">{{ filtrados().length }}</text>
                    <text class="donut-cap" x="90" y="104">contratos</text>
                  </svg>
                </div>
                <ul class="leyenda">
                  @for (s of donut(); track s.label) {
                    <li>
                      <span class="dot" [style.background]="s.color"></span>
                      <span class="lg-label">{{ s.label }}</span>
                      <span class="lg-val">{{ s.valor }}</span>
                    </li>
                  }
                </ul>
              } @else {
                <p class="vacio">Sin datos.</p>
              }
            </div>
          </div>

          <!-- Alertas + sectores -->
          <div class="grid2b">
            <div class="card">
              <div class="card-head">
                <div>
                  <h3>
                    <i class="bi bi-exclamation-triangle text-warning me-2"></i>Próximos vencimientos
                    <span class="info" tabindex="0" [attr.data-tip]="tipVencimientos()">i</span>
                  </h3>
                  <p>{{ subVencimientos() }}</p>
                </div>
              </div>
              @if (porVencer().length === 0) {
                <p class="vacio">Ningún contrato por vencer con estos filtros. 🎉</p>
              } @else {
                <table class="tabla">
                  <thead>
                    <tr><th>N°</th><th>Título</th><th>Proveedor</th><th>Vence</th><th class="r">Días</th></tr>
                  </thead>
                  <tbody>
                    @for (c of porVencer(); track c.id) {
                      <tr>
                        <td><a [routerLink]="['/contratos', c.id]">{{ c.numero }}</a></td>
                        <td>{{ c.titulo }}</td>
                        <td class="muted">{{ c.proveedor_nombre }}</td>
                        <td class="muted">{{ c.fecha_fin | date: 'dd/MM/yy' }}</td>
                        <td class="r">
                          <span class="badge" [class.rojo]="c.dias_restantes! <= 7">
                            {{ c.dias_restantes }} d
                          </span>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            </div>

            <div class="card">
              <div class="card-head">
                <div>
                  <h3>Distribución por sector</h3>
                  <p>Pasá el mouse por cada sector para ver su total</p>
                </div>
              </div>
              @if (porSector().length > 0) {
                <div class="barras">
                  @for (s of porSector(); track s.sector) {
                    <div class="barra" tabindex="0">
                      <div class="barra-top">
                        <span>{{ s.sector }}</span>
                        <span class="fw">{{ s.cantidad }}</span>
                      </div>
                      <div class="track"><div class="fill" [style.width.%]="s.pct"></div></div>

                      <div class="sec-tip">
                        <span class="st-sector">{{ s.sector }}</span>
                        <span class="st-linea">
                          {{ s.cantidad }} {{ s.cantidad === 1 ? 'contrato' : 'contratos' }}
                          <span class="st-pct">({{ s.pctTotal }}% del total)</span>
                        </span>
                        @if (s.montos.length > 0) {
                          <span class="st-cap">Monto contratado</span>
                          @for (m of s.montos; track m) {
                            <span class="st-monto">{{ m }}</span>
                          }
                        } @else {
                          <span class="st-cap">Sin montos cargados</span>
                        }
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <p class="vacio">Sin datos.</p>
              }
            </div>
          </div>
        }
      </section>
    </div>
  `,
  styles: [`
    /* Paleta Offal (definida en styles.scss :root). El acento propio del panel
       es el rojo de marca; los colores de estado (activo/vencido/…) son
       semánticos y viven en el TS. */
    :host { display: block; }
    .dash { display: grid; grid-template-columns: 260px 1fr; gap: 24px; align-items: start; }
    @media (max-width: 900px) { .dash { grid-template-columns: 1fr; } }

    /* ---- Filtros ---- */
    .filtros {
      position: sticky; top: 16px; background: var(--panel); border: 1px solid var(--line);
      border-radius: 16px; padding: 18px; box-shadow: 0 8px 24px rgba(0,0,0,.35);
    }
    .filtros-head {
      display: flex; justify-content: space-between; align-items: center;
      font-weight: 700; color: var(--text); margin-bottom: 16px; font-size: 15px;
    }
    .btn-limpiar {
      border: none; background: rgba(199,22,58,.12); color: var(--red-bright); font-size: 12px; font-weight: 600;
      padding: 4px 10px; border-radius: 8px; cursor: pointer;
    }
    .btn-limpiar:hover { background: rgba(199,22,58,.2); }
    .fg { margin-bottom: 16px; }
    .fg > label {
      display: block; font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: .04em; color: var(--muted); margin-bottom: 8px;
    }
    .buscar { position: relative; }
    .buscar i { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: 13px; }
    .buscar input { padding-left: 32px; }
    .fg input, .fg select {
      width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 8px 11px;
      font-size: 13px; color: var(--text); background: var(--bg-2); outline: none;
    }
    .fg select option { background: var(--panel); color: var(--text); }
    .fg input:focus, .fg select:focus { border-color: var(--red); box-shadow: 0 0 0 3px rgba(199,22,58,.2); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip {
      display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--line);
      background: var(--bg-2); color: var(--muted); font-size: 12px; font-weight: 500;
      padding: 5px 10px; border-radius: 20px; cursor: pointer; transition: all .15s;
    }
    .chip .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c, #8ba0ab); }
    .chip:hover { border-color: var(--muted); color: var(--text); }
    .chip.on { background: var(--c, var(--red)); border-color: var(--c, var(--red)); color: #fff; }
    .chip.on .dot { background: #fff; }
    .filtros-foot {
      margin-top: 8px; padding-top: 14px; border-top: 1px solid var(--line);
      font-size: 12px; color: var(--muted); text-align: center;
    }

    /* ---- Head ---- */
    .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .head h2 { font-size: 26px; font-weight: 800; color: var(--text); margin: 0; letter-spacing: -.02em; }
    .head p { color: var(--muted); margin: 4px 0 0; font-size: 14px; }
    .btn-nuevo {
      background: var(--red); color: #fff; border-radius: 10px; padding: 10px 16px;
      font-weight: 600; font-size: 14px; text-decoration: none; white-space: nowrap;
      box-shadow: 0 8px 20px rgba(199,22,58,.35);
    }
    .btn-nuevo:hover { background: var(--red-bright); color: #fff; }

    /* ---- Exportar ---- */
    .acciones { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .btn-exp {
      background: var(--bg-2); color: var(--text); border: 1px solid var(--line);
      border-radius: 10px; padding: 10px 14px; font-weight: 600; font-size: 14px;
      cursor: pointer; white-space: nowrap; transition: border-color .15s, background .15s;
    }
    .btn-exp:hover:not(:disabled) { border-color: var(--red); background: rgba(199,22,58,.1); }
    .btn-exp:disabled { opacity: .45; cursor: not-allowed; }

    /* ---- Ícono de info con globito ---- */
    .info {
      display: inline-grid; place-items: center; width: 16px; height: 16px;
      border-radius: 50%; border: 1px solid var(--muted); color: var(--muted);
      font-size: 10px; font-weight: 700; font-style: normal; cursor: help;
      margin-left: 6px; vertical-align: middle; position: relative;
    }
    .info:hover, .info:focus-visible { border-color: var(--red-bright); color: var(--red-bright); outline: none; }
    .info::after {
      content: attr(data-tip);
      position: absolute; top: calc(100% + 8px); left: 0; z-index: 20;
      width: 300px; white-space: pre-line; text-align: left;
      background: var(--bg-2); color: var(--text);
      border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px;
      font-size: 12px; font-weight: 400; line-height: 1.5;
      box-shadow: 0 12px 30px rgba(0,0,0,.5);
      opacity: 0; visibility: hidden; transition: opacity .15s;
    }
    .info:hover::after, .info:focus-visible::after { opacity: 1; visibility: visible; }

    /* ---- Tooltip de sector (hover en la barra) ---- */
    .barra { position: relative; }
    .barra:focus-visible { outline: none; }
    .barra:hover .barra-top, .barra:focus-visible .barra-top { color: var(--text); }
    .sec-tip {
      position: absolute; bottom: calc(100% + 6px); left: 0; z-index: 20;
      display: flex; flex-direction: column; gap: 2px; min-width: 190px;
      background: var(--bg-2); border: 1px solid var(--line); border-radius: 10px;
      padding: 10px 12px; box-shadow: 0 12px 30px rgba(0,0,0,.5);
      opacity: 0; visibility: hidden; transform: translateY(4px);
      transition: opacity .15s, transform .15s; pointer-events: none;
    }
    .barra:hover .sec-tip, .barra:focus-visible .sec-tip { opacity: 1; visibility: visible; transform: translateY(0); }
    .st-sector { font-size: 13px; font-weight: 700; color: var(--text); }
    .st-linea { font-size: 12px; color: var(--muted); }
    .st-pct { opacity: .8; }
    .st-cap {
      margin-top: 6px; font-size: 10px; font-weight: 700; letter-spacing: .06em;
      text-transform: uppercase; color: var(--muted);
    }
    .st-monto { font-size: 13px; font-weight: 700; color: var(--text); }

    /* ---- KPIs ---- */
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
    @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 560px) { .kpis { grid-template-columns: 1fr; } }
    .kpi {
      position: relative; background: var(--panel); border: 1px solid var(--line); border-radius: 16px;
      padding: 18px 18px 0; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,.35);
    }
    .kpi-top { display: flex; justify-content: space-between; align-items: center; }
    .kpi-label { font-size: 13px; color: var(--muted); font-weight: 500; }
    .kpi-icon {
      width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center;
      background: color-mix(in srgb, var(--c) 22%, transparent); color: var(--c); font-size: 16px;
    }
    .kpi-valor { font-size: 28px; font-weight: 800; color: var(--text); margin: 8px 0 2px; letter-spacing: -.02em; }
    .kpi-sub { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
    .spark { width: 100%; height: 34px; display: block; }
    .spark-line { fill: none; stroke: var(--c); stroke-width: 2; vector-effect: non-scaling-stroke; }
    .spark-area { fill: color-mix(in srgb, var(--c) 16%, transparent); stroke: none; }

    /* ---- Cards ---- */
    .card {
      background: var(--panel); border: 1px solid var(--line); border-radius: 16px; padding: 20px;
      box-shadow: 0 8px 24px rgba(0,0,0,.35);
    }
    .card-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
    .card-head h3 { font-size: 16px; font-weight: 700; color: var(--text); margin: 0; }
    .card-head p { font-size: 13px; color: var(--muted); margin: 3px 0 0; }
    .grid2 { display: grid; grid-template-columns: 1.7fr 1fr; gap: 16px; margin-bottom: 20px; }
    .grid2b { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; }
    @media (max-width: 1000px) { .grid2, .grid2b { grid-template-columns: 1fr; } }

    .toggle { display: inline-flex; background: var(--bg-2); border-radius: 9px; padding: 3px; }
    .toggle button {
      border: none; background: transparent; font-size: 13px; font-weight: 600; color: var(--muted);
      padding: 5px 14px; border-radius: 7px; cursor: pointer;
    }
    .toggle button.on { background: var(--panel-2); color: var(--text); box-shadow: 0 1px 2px rgba(0,0,0,.3); }

    /* ---- Área ---- */
    .area-chart { width: 100%; height: 300px; }
    .area-fill { fill: rgba(199,22,58,.14); stroke: none; }
    .area-line { fill: none; stroke: var(--red-bright); stroke-width: 2.5; vector-effect: non-scaling-stroke; }
    .area-pt { fill: var(--red-bright); stroke: var(--panel); stroke-width: 1.5; }
    .grid { stroke: var(--line); stroke-width: 1; stroke-dasharray: 4 4; }
    .axis-y { fill: var(--muted); font-size: 11px; text-anchor: end; }
    .axis-x { fill: var(--muted); font-size: 11px; text-anchor: middle; }

    /* ---- Donut ---- */
    .donut-wrap { display: grid; place-items: center; padding: 6px 0; }
    .donut { width: 180px; height: 180px; transform: rotate(-90deg); }
    .donut-bg { fill: none; stroke: var(--bg-2); stroke-width: 18; }
    .donut-seg { fill: none; stroke-width: 18; stroke-linecap: butt; transition: stroke-dasharray .4s; }
    .donut-num { transform: rotate(90deg); transform-origin: 90px 90px; text-anchor: middle; font-size: 30px; font-weight: 800; fill: var(--text); }
    .donut-cap { transform: rotate(90deg); transform-origin: 90px 90px; text-anchor: middle; font-size: 11px; fill: var(--muted); }
    .leyenda { list-style: none; margin: 14px 0 0; padding: 0; }
    .leyenda li { display: flex; align-items: center; padding: 6px 0; font-size: 13px; border-top: 1px solid var(--line); }
    .leyenda .dot { width: 10px; height: 10px; border-radius: 50%; margin-right: 10px; }
    .lg-label { color: var(--muted); text-transform: capitalize; }
    .lg-val { margin-left: auto; font-weight: 700; color: var(--text); }

    /* ---- Tabla ---- */
    .tabla { width: 100%; border-collapse: collapse; font-size: 13px; }
    .tabla th { text-align: left; color: var(--muted); font-weight: 600; font-size: 11px; text-transform: uppercase; padding: 8px 10px; border-bottom: 1px solid var(--line); }
    .tabla td { padding: 10px; border-bottom: 1px solid var(--line); color: var(--text); }
    .tabla tr:last-child td { border-bottom: none; }
    .tabla a { color: var(--cyan); font-weight: 600; text-decoration: none; }
    .tabla .muted { color: var(--muted); }
    .tabla .r { text-align: right; }
    .badge { background: rgba(234,179,8,.16); color: #facc15; font-weight: 700; font-size: 12px; padding: 3px 9px; border-radius: 20px; }
    .badge.rojo { background: rgba(199,22,58,.18); color: var(--red-bright); }

    /* ---- Barras ---- */
    .barra { margin-bottom: 14px; }
    .barra-top { display: flex; justify-content: space-between; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
    .barra-top .fw { font-weight: 700; color: var(--text); }
    .track { height: 8px; background: var(--bg-2); border-radius: 6px; overflow: hidden; }
    .fill { height: 100%; background: linear-gradient(90deg, var(--red-deep), var(--red-bright)); border-radius: 6px; transition: width .4s; }

    .loading { display: grid; place-items: center; padding: 80px 0; }
    .vacio { color: var(--muted); text-align: center; padding: 30px 0; font-size: 14px; margin: 0; }

    /* ---- Impresión / Guardar como PDF ----
       El panel es oscuro: para el PDF se pasa a fondo claro (legible y sin
       gastar tinta) y se ocultan los controles que no aportan en papel. */
    @media print {
      .filtros, .acciones, .toggle, .info, .sec-tip { display: none !important; }

      .dash { grid-template-columns: 1fr; gap: 0; }
      .grid2, .grid2b { grid-template-columns: 1fr; gap: 12px; }
      .kpis { grid-template-columns: repeat(4, 1fr); gap: 10px; }

      /* Cada tarjeta entera en la misma hoja. */
      .card, .kpi { break-inside: avoid; page-break-inside: avoid; box-shadow: none; }

      :host {
        --panel: #fff; --panel-2: #fff; --bg-2: #f4f5f7;
        --text: #111; --muted: #555; --line: #ccc;
      }
      .card, .kpi { background: #fff !important; border-color: #ccc !important; }
      .head h2, .kpi-valor, .card-head h3, .lg-val, .barra-top .fw { color: #111 !important; }
      .tabla td { color: #111 !important; }
      .tabla a { color: #111 !important; }
    }
  `],
})
export class DashboardComponent implements OnInit {
  // --- datos ---
  todos = signal<Contrato[]>([]);
  proveedores = signal<Proveedor[]>([]);
  cargando = signal(true);

  // --- estado de filtros ---
  buscar = signal('');
  estadoSel = signal<Set<string>>(new Set());
  sectorSel = signal('');
  proveedorSel = signal(0);
  tipoSel = signal('');
  monedaSel = signal('');
  venceEnDias = signal<number | null>(null);
  metrica = signal<Metrica>('monto');

  // --- opciones ---
  estados = [
    { valor: 'activo', label: 'Activo', color: '#16a34a' },
    { valor: 'vencido', label: 'Vencido', color: '#dc2626' },
    { valor: 'borrador', label: 'Borrador', color: '#f59e0b' },
    { valor: 'renovado', label: 'Renovado', color: '#14b8a6' },
    { valor: 'cancelado', label: 'Cancelado', color: '#94a3b8' },
  ];
  tipos = ['servicio', 'suministro', 'arrendamiento', 'distribucion', 'confidencialidad', 'otro'];
  ventanas = [30, 60, 90];
  donutCirc = 2 * Math.PI * 70;
  private colorEstado: Record<string, string> = Object.fromEntries(
    this.estados.map((e) => [e.valor, e.color]),
  );

  constructor(private contratos: ContratosService, private provSvc: ProveedoresService) {}

  ngOnInit(): void {
    this.contratos.listar().subscribe((c) => {
      this.todos.set(c);
      this.cargando.set(false);
    });
    this.provSvc.listar().subscribe((p) => this.proveedores.set(p));
  }

  // --- derivados de opciones ---
  sectores = computed<Sector[]>(() => {
    const nombres = new Set<string>();
    this.todos().forEach((c) => c.sector_nombre && nombres.add(c.sector_nombre));
    return [...nombres].sort().map((n, i) => ({ id: i, nombre: n }));
  });
  monedas = computed(() => [...new Set(this.todos().map((c) => c.moneda))].sort());

  hayFiltros = computed(() =>
    this.buscar() !== '' || this.estadoSel().size > 0 || this.sectorSel() !== '' ||
    this.proveedorSel() !== 0 || this.tipoSel() !== '' || this.monedaSel() !== '' ||
    this.venceEnDias() !== null,
  );

  // --- lista filtrada ---
  filtrados = computed(() => {
    const q = this.buscar().toLowerCase().trim();
    const est = this.estadoSel();
    const sec = this.sectorSel(), prov = this.proveedorSel(), tipo = this.tipoSel();
    const mon = this.monedaSel(), venc = this.venceEnDias();
    return this.todos().filter((c) => {
      if (est.size && !est.has(c.estado)) return false;
      if (sec && c.sector_nombre !== sec) return false;
      if (prov && c.proveedor_id !== prov) return false;
      if (tipo && c.tipo !== tipo) return false;
      if (mon && c.moneda !== mon) return false;
      if (venc !== null && !(c.estado === 'activo' && c.dias_restantes != null && c.dias_restantes >= 0 && c.dias_restantes <= venc)) return false;
      if (q && !(`${c.numero} ${c.titulo} ${c.proveedor_nombre ?? ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  });

  // --- serie mensual (para KPIs y área) ---
  private serieMensual = computed(() => {
    const lista = this.filtrados();
    const buckets = new Map<string, { count: number; monto: number; fecha: Date }>();
    lista.forEach((c) => {
      const d = new Date(c.fecha_inicio);
      if (isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const b = buckets.get(key) ?? { count: 0, monto: 0, fecha: new Date(d.getFullYear(), d.getMonth(), 1) };
      b.count += 1;
      b.monto += Number(c.monto) || 0;
      buckets.set(key, b);
    });
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => v);
  });

  // --- KPIs ---
  kpis = computed(() => {
    const f = this.filtrados();
    const activos = f.filter((c) => c.estado === 'activo');
    const porVencer = activos.filter((c) => c.dias_restantes != null && c.dias_restantes >= 0 && c.dias_restantes <= 30);
    const montoPrincipal = this.montoActivoPrincipal(activos);
    const serie = this.serieMensual();

    const acumCount: number[] = [];
    serie.reduce((acc, b) => { acc += b.count; acumCount.push(acc); return acc; }, 0);
    const acumMonto: number[] = [];
    serie.reduce((acc, b) => { acc += b.monto; acumMonto.push(acc); return acc; }, 0);

    return [
      { label: 'Total contratos', valor: String(f.length), sub: `${activos.length} activos`,
        icon: 'bi-collection', color: '#c7163a', ...this.spark(acumCount.length ? acumCount : [0, f.length]) },
      { label: 'Vigentes', valor: String(activos.length), sub: 'en curso',
        icon: 'bi-check2-circle', color: '#14b8a6', ...this.spark(serie.map((b) => b.count)) },
      { label: 'Por vencer (30d)', valor: String(porVencer.length), sub: 'requieren atención',
        icon: 'bi-alarm', color: '#f59e0b', ...this.spark(porVencer.length ? [1, 2, porVencer.length] : [0, 0]) },
      { label: `Monto activo (${montoPrincipal.moneda})`, valor: montoPrincipal.etq, sub: 'contratos vigentes',
        icon: 'bi-cash-stack', color: '#0ea5e9', ...this.spark(acumMonto.length ? acumMonto : [0, montoPrincipal.total]) },
    ];
  });

  private montoActivoPrincipal(activos: Contrato[]) {
    const porMoneda = new Map<string, number>();
    activos.forEach((c) => porMoneda.set(c.moneda, (porMoneda.get(c.moneda) ?? 0) + (Number(c.monto) || 0)));
    let moneda = this.monedaSel() || 'USD', total = 0;
    if (!this.monedaSel()) {
      for (const [m, v] of porMoneda) if (v > total) { total = v; moneda = m; }
    } else {
      total = porMoneda.get(moneda) ?? 0;
    }
    return { moneda, total, etq: this.abreviar(total) };
  }

  private abreviar(n: number): string {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(Math.round(n));
  }

  // --- sparkline (viewBox 0 0 100 30) ---
  private spark(serie: number[]): { linea: string; area: string } {
    const pts = serie.length >= 2 ? serie : [0, ...(serie.length ? serie : [0])];
    const max = Math.max(...pts), min = Math.min(...pts);
    const span = max - min || 1;
    const step = 100 / (pts.length - 1);
    const coords = pts.map((v, i) => [i * step, 28 - ((v - min) / span) * 24]);
    const linea = coords.map((c, i) => `${i ? 'L' : 'M'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ');
    const area = `${linea} L100,30 L0,30 Z`;
    return { linea, area };
  }

  // --- gráfico de área (viewBox 0 0 760 300) ---
  serie = computed(() => {
    const serie = this.serieMensual();
    const metrica = this.metrica();
    const vals = serie.map((b) => (metrica === 'monto' ? b.monto : b.count));
    if (!serie.length) return { puntos: [], linea: '', area: '', gridY: [] as { y: number; etq: string }[] };

    const x0 = 70, x1 = 750, yTop = 20, yBot = 270;
    const max = Math.max(...vals, 1);
    const step = serie.length > 1 ? (x1 - x0) / (serie.length - 1) : 0;
    const y = (v: number) => yBot - (v / max) * (yBot - yTop);
    const x = (i: number) => (serie.length > 1 ? x0 + i * step : (x0 + x1) / 2);
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const puntos = serie.map((b, i) => ({
      x: x(i), y: y(vals[i]),
      mesCorto: meses[b.fecha.getMonth()],
      etq: `${meses[b.fecha.getMonth()]} ${b.fecha.getFullYear()}`,
      tip: metrica === 'monto' ? this.abreviar(vals[i]) : String(vals[i]),
    }));

    const linea = puntos.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area = `${linea} L${puntos[puntos.length - 1].x.toFixed(1)},${yBot} L${puntos[0].x.toFixed(1)},${yBot} Z`;

    const gridY = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
      y: yBot - f * (yBot - yTop),
      etq: metrica === 'monto' ? this.abreviar(max * f) : String(Math.round(max * f)),
    }));

    return { puntos, linea, area, gridY };
  });

  // --- donut por estado ---
  donut = computed<Segmento[]>(() => {
    const f = this.filtrados();
    const conteo = new Map<string, number>();
    f.forEach((c) => conteo.set(c.estado, (conteo.get(c.estado) ?? 0) + 1));
    const total = f.length || 1;
    let offset = 0;
    return [...conteo.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([estado, valor]) => {
        const dash = (valor / total) * this.donutCirc;
        const seg: Segmento = {
          label: estado, valor, color: this.colorEstado[estado] ?? '#94a3b8',
          dash, offset: -offset,
        };
        offset += dash;
        return seg;
      });
  });

  // --- tabla por vencer ---
  // Solo se muestran los más próximos; el total real está en totalPorVencer().
  readonly MAX_VENCIMIENTOS = 8;

  porVencer = computed(() =>
    this.filtrados()
      .filter((c) => c.estado === 'activo' && c.dias_restantes != null && c.dias_restantes >= 0 && c.dias_restantes <= (this.venceEnDias() ?? 30))
      .sort((a, b) => (a.dias_restantes ?? 0) - (b.dias_restantes ?? 0))
      .slice(0, this.MAX_VENCIMIENTOS),
  );

  // --- textos de ayuda de "Próximos vencimientos" ---
  // La caja usa la ventana del filtro "Vence en" (30 por defecto), mientras que
  // el KPI "Por vencer (30d)" siempre mira 30 días: por eso pueden no coincidir.
  tipVencimientos = computed(() => {
    const dias = this.venceEnDias() ?? 30;
    const total = this.totalPorVencer();
    return (
      `Contratos ACTIVOS cuya fecha de fin cae dentro de los próximos ${dias} días.\n\n` +
      `• La ventana la define el filtro «Vence en» (30 días si no elegís otra).\n` +
      `• El KPI «Por vencer (30d)» siempre usa 30 días, así que puede no coincidir con esta lista.\n` +
      `• Acá se listan solo los ${this.MAX_VENCIMIENTOS} más próximos` +
      (total > this.MAX_VENCIMIENTOS ? ` (de ${total} en total).` : '.')
    );
  });

  subVencimientos = computed(() => {
    const dias = this.venceEnDias() ?? 30;
    const total = this.totalPorVencer();
    if (total === 0) return `Dentro de ${dias} días`;
    const mostrados = Math.min(total, this.MAX_VENCIMIENTOS);
    const detalle = total > mostrados ? `Los ${mostrados} más próximos de ${total}` : `${total} en total`;
    return `${detalle} · dentro de ${dias} días`;
  });

  // Cuántos hay realmente por vencer (sin el recorte de la tabla).
  private totalPorVencer = computed(() =>
    this.filtrados().filter(
      (c) => c.estado === 'activo' && c.dias_restantes != null &&
             c.dias_restantes >= 0 && c.dias_restantes <= (this.venceEnDias() ?? 30),
    ).length,
  );

  // --- barras por sector (con monto por moneda para el hover) ---
  porSector = computed(() => {
    const acc = new Map<string, { cantidad: number; montos: Map<string, number> }>();
    this.filtrados().forEach((c) => {
      const s = c.sector_nombre || 'Sin sector';
      const e = acc.get(s) ?? { cantidad: 0, montos: new Map<string, number>() };
      e.cantidad += 1;
      const monto = Number(c.monto) || 0;
      if (monto) e.montos.set(c.moneda, (e.montos.get(c.moneda) ?? 0) + monto);
      acc.set(s, e);
    });

    const totalContratos = this.filtrados().length || 1;
    const max = Math.max(...[...acc.values()].map((v) => v.cantidad), 1);

    return [...acc.entries()]
      .sort((a, b) => b[1].cantidad - a[1].cantidad)
      .map(([sector, v]) => ({
        sector,
        cantidad: v.cantidad,
        pct: (v.cantidad / max) * 100,
        pctTotal: Math.round((v.cantidad / totalContratos) * 100),
        montos: [...v.montos.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([moneda, total]) => `${moneda} ${this.fmtMonto(total)}`),
      }));
  });

  private fmtMonto(n: number): string {
    return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // --- exportación ---

  /**
   * Descarga los contratos filtrados como CSV (Excel lo abre nativo).
   * Se usa ";" como separador y BOM UTF-8, que es lo que espera el Excel en
   * español para respetar acentos y no partir los números con coma decimal.
   */
  /** Marca de orden de bytes: hace que Excel lea el CSV como UTF-8 (acentos). */
  private readonly BOM_EXCEL = String.fromCharCode(0xFEFF);

  exportarExcel(): void {
    const filas = this.filtrados();
    if (filas.length === 0) return;

    const cabeceras = ['N°', 'Título', 'Proveedor', 'Sector', 'Tipo', 'Estado',
                       'Moneda', 'Monto', 'Inicio', 'Fin', 'Días restantes'];

    const cuerpo = filas.map((c) => [
      c.numero, c.titulo, c.proveedor_nombre ?? '', c.sector_nombre ?? 'Sin sector',
      c.tipo, c.estado, c.moneda,
      (Number(c.monto) || 0).toFixed(2).replace('.', ','),   // coma decimal
      this.fmtFecha(c.fecha_inicio), this.fmtFecha(c.fecha_fin),
      c.dias_restantes ?? '',
    ]);

    const csv = [cabeceras, ...cuerpo]
      .map((f) => f.map((v) => this.celdaCsv(v)).join(';'))
      .join('\r\n');

    // El BOM es lo que hace que Excel abra el archivo como UTF-8 y
    // respete los acentos. Va como escape para que no sea un carácter invisible.
    this.descargar(this.BOM_EXCEL + csv, this.nombreArchivo('csv'), 'text/csv;charset=utf-8;');
  }

  /** Abre el diálogo de impresión; el usuario elige "Guardar como PDF". */
  exportarPdf(): void {
    window.print();
  }

  /** Escapa una celda CSV: comillas dobles y saltos de línea. */
  private celdaCsv(valor: unknown): string {
    const s = String(valor ?? '');
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  private fmtFecha(f: string | null | undefined): string {
    if (!f) return '';
    const d = new Date(f);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-AR');
  }

  private nombreArchivo(ext: string): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `contratos-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
  }

  private descargar(contenido: string, nombre: string, tipo: string): void {
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- acciones filtros ---
  toggleEstado(v: string) {
    const s = new Set(this.estadoSel());
    s.has(v) ? s.delete(v) : s.add(v);
    this.estadoSel.set(s);
  }
  limpiar() {
    this.buscar.set(''); this.estadoSel.set(new Set()); this.sectorSel.set('');
    this.proveedorSel.set(0); this.tipoSel.set(''); this.monedaSel.set('');
    this.venceEnDias.set(null);
  }
}
