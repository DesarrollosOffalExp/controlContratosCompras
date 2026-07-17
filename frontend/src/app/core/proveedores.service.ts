import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Proveedor } from './models';

@Injectable({ providedIn: 'root' })
export class ProveedoresService {
  private api = `${environment.apiUrl}/proveedores`;

  constructor(private http: HttpClient) {}

  listar(): Observable<Proveedor[]> {
    return this.http.get<Proveedor[]>(this.api);
  }

  crear(proveedor: Partial<Proveedor>): Observable<Proveedor> {
    return this.http.post<Proveedor>(this.api, proveedor);
  }

  actualizar(id: number, proveedor: Partial<Proveedor>): Observable<Proveedor> {
    return this.http.put<Proveedor>(`${this.api}/${id}`, proveedor);
  }

  eliminar(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/${id}`);
  }
}
