"""Convert old zipped CSV data files to parquet with renamed columns."""

import zipfile
import io
import os
import pandas as pd

OLD_DIR = os.path.join(os.path.dirname(__file__), "old_data")
OUT_DIR = os.path.dirname(__file__)

COLUMN_RENAMES = {
    "cause": "cause",
    "quantile_field": "countyMeasure",
    "crude_rate": "crudeRate",
    "age_adjusted_rate": "ageAdjustedRate",
    "state_fips": "stateFips",
    "county_fips": "countyFips",
    "age_group": "ageGroup",
}

# Map old file prefixes to new domain names
FILE_MAPPINGS = []

# age_adjusted_data → by-county
for year in ["2018", "2019", "2020", "2021", "2022", "2018-2022"]:
    FILE_MAPPINGS.append((
        f"age_adjusted_data_{year}.csv.zip",
        f"data_by-county_{year}.parquet",
    ))

# demographic_data → by-age
for year in ["2018", "2019", "2020", "2021", "2022", "2018-2022"]:
    FILE_MAPPINGS.append((
        f"demographic_data_{year}.csv.zip",
        f"data_by-age_{year}.parquet",
    ))

# population_data → by-population
for year in ["2018", "2019", "2020", "2021", "2022", "2018-2022"]:
    FILE_MAPPINGS.append((
        f"population_data_{year}.csv.zip",
        f"data_by-population_{year}.parquet",
    ))

# quantile_data → by-measure-quantile
for qtype in ["q3", "q4", "q5", "q10"]:
    FILE_MAPPINGS.append((
        f"quantile_data_2018-2022_ref-2022_{qtype}.csv.zip",
        f"data_by-measure-quantile_{qtype}_2018-2022.parquet",
    ))


def convert(src_name, dst_name):
    src_path = os.path.join(OLD_DIR, src_name)
    dst_path = os.path.join(OUT_DIR, dst_name)

    numeric_int = {"deaths", "population"}
    numeric_float = {"crudeRate", "ageAdjustedRate"}

    with zipfile.ZipFile(src_path) as z:
        csv_name = z.namelist()[0]
        with z.open(csv_name) as f:
            df = pd.read_csv(f, dtype=str)

    df.rename(columns=COLUMN_RENAMES, inplace=True)
    df.replace("All", "Total", inplace=True)

    for col in df.columns:
        if col in numeric_int:
            df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int32")
        elif col in numeric_float:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    df.to_parquet(dst_path, index=False)
    print(f"  {src_name} -> {dst_name} ({len(df)} rows)")


if __name__ == "__main__":
    for src, dst in FILE_MAPPINGS:
        convert(src, dst)
    print("Done.")
