import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Contrato, Sector } from './models';

export interface FiltroContratos {
  estado?: string;
  tipo?: string;
  proveedor_id?: number;
  buscar?: string;
  por_vencer?: number;
}

@Injectable({ providedIn: 'root' })
export class ContratosService {
  private api = `${environment.apiUrl}/contratos`;
  private sectoresApi = `${environment.apiUrl}/sectores`;

  constructor(private http: HttpClient) {}

  listar(filtro: FiltroContratos = {}): Observable<Contrato[]> {
    let params = new HttpParams();
    Object.entries(filtro).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        params = params.set(k, String(v));
      }
    });
    return this.http.get<Contrato[]>(this.api, { params });
  }

  obtener(id: number): Observable<Contrato> {
    return this.http.get<Contrato>(`${this.api}/${id}`);
  }

  crear(contrato: Partial<Contrato>): Observable<Contrato> {
    return this.http.post<Contrato>(this.api, contrato);
  }

  actualizar(id: number, contrato: Partial<Contrato>): Observable<Contrato> {
    return this.http.put<Contrato>(`${this.api}/${id}`, contrato);
  }

  eliminar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/${id}`);
  }

  // --- PDF adjunto del contrato ---
  subirArchivo(id: number, archivo: File): Observable<Contrato> {
    const form = new FormData();
    form.append('archivo', archivo);
    return this.http.post<Contrato>(`${this.api}/${id}/archivo`, form);
  }

  descargarArchivo(id: number): Observable<Blob> {
    return this.http.get(`${this.api}/${id}/archivo`, { responseType: 'blob' });
  }

  eliminarArchivo(id: number): Observable<Contrato> {
    return this.http.delete<Contrato>(`${this.api}/${id}/archivo`);
  }

  listarSectores(): Observable<Sector[]> {
    return this.http.get<Sector[]>(this.sectoresApi);
  }

  crearSector(sector: Partial<Sector>): Observable<Sector> {
    return this.http.post<Sector>(this.sectoresApi, sector);
  }

  actualizarSector(id: number, sector: Partial<Sector>): Observable<Sector> {
    return this.http.put<Sector>(`${this.sectoresApi}/${id}`, sector);
  }

  eliminarSector(id: number): Observable<void> {
    return this.http.delete<void>(`${this.sectoresApi}/${id}`);
  }
}
