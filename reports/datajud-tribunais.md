# Tribunais com processos (mapeamento DataJud)

Fonte: processos_import.csv (processos CNJ válidos: 913).

Tabela (segmento J / TR do CNJ -> tribunal e alias DataJud):

| J | TR | Tribunal | Alias DataJud | Qtd processos |
|---|----|----------|--------------|---------------|
| 4 | 01 | TRF1 | trf1 | 405 |
| 4 | 03 | TRF3 | trf3 | 4 |
| 4 | 05 | TRF5 | trf5 | 1 |
| 4 | 06 | TRF6 | trf6 | 12 |
| 5 | 02 | TRT2 | trt2 | 1 |
| 5 | 05 | TRT5 | trt5 | 39 |
| 5 | 15 | TRT15 | trt15 | 1 |
| 8 | 02 | TJAL | tjal | 2 |
| 8 | 04 | TJAM | tjam | 1 |
| 8 | 05 | TJBA | tjba | 421 |
| 8 | 07 | TJDFT | tjdft | 5 |
| 8 | 11 | TJMG | tjmg | 1 |
| 8 | 12 | TJMS | tjms | 2 |
| 8 | 13 | TJMT | tjmt | 2 |
| 8 | 16 | TJPR | tjpr | 8 |
| 8 | 19 | TJRJ | tjrj | 3 |
| 8 | 22 | TJRO | tjro | 3 |
| 8 | 26 | TJSP | tjsp | 2 |

Observações:
- O formato do número CNJ é NNNNNNN-DD.AAAA.J.TR.OOOO; usamos J/TR para inferir o tribunal.
- Para Justiça Federal (J=4), TR corresponde à região (TRF1–TRF6).
- Para Justiça do Trabalho (J=5), TR corresponde ao TRT da região (TRT1–TRT24).
- Para Justiça Estadual (J=8), o mapeamento TR->UF foi inferido por ordem alfabética de UF (AC=01 … TO=27).

Aliases DataJud seguem o padrão `api_publica_<alias>/_search`.