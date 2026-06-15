import unittest

import pandas as pd

from etl.transform import transform


class TransformTests(unittest.TestCase):
    def test_transform_removes_empty_and_duplicate_rows(self):
        valid = {
            "FECHA_DESEMBOLSO": "20240117",
            "PRODUCTO": " NMIV ",
            "DEPARTAMENTO": "Lima",
            "PROVINCIA": "Lima",
            "DISTRITO": "Lima",
            "UBIGEO": "150101",
            "IFI": "Credito",
            "TIPO_IFI": "Banco",
            "MONTO_CREDITO": "243620.00",
            "MONTO_CUOTA_INICIAL": "28480.00",
            "PLAZOS": "180.00",
            "TASA": "9.80",
            "MONTO_VALOR_VIVIENDA": "284800.00",
            "FECHA_CORTE": "20250108",
        }
        frame = pd.DataFrame([valid, valid, {key: None for key in valid}])

        result, metrics = transform(frame)

        self.assertEqual(len(result), 1)
        self.assertEqual(metrics["filas_vacias"], 1)
        self.assertEqual(metrics["duplicados_eliminados"], 1)
        self.assertEqual(result.iloc[0]["departamento"], "LIMA")
        self.assertEqual(len(result.iloc[0]["record_hash"]), 64)

    def test_transform_rejects_invalid_business_values(self):
        invalid = {
            "FECHA_DESEMBOLSO": "20240117",
            "PRODUCTO": "NMIV",
            "DEPARTAMENTO": "LIMA",
            "PROVINCIA": "LIMA",
            "DISTRITO": "LIMA",
            "UBIGEO": "150101",
            "IFI": "CREDITO",
            "TIPO_IFI": "BANCO",
            "MONTO_CREDITO": "-1",
            "MONTO_CUOTA_INICIAL": "0",
            "PLAZOS": "180",
            "TASA": "9.8",
            "MONTO_VALOR_VIVIENDA": "284800",
            "FECHA_CORTE": "20250108",
        }

        result, metrics = transform(pd.DataFrame([invalid]))

        self.assertTrue(result.empty)
        self.assertEqual(metrics["filas_invalidas"], 1)


if __name__ == "__main__":
    unittest.main()

