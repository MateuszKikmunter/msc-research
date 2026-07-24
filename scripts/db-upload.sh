BUCKET="msc-analytics"

cd ../chinook

for file in *.parquet; do
  table="${file%.parquet}"

  aws s3 --profile matt-dev cp "$file" \
    "s3://${BUCKET}/chinook/${table}/${file}"
done