#!/bin/bash
# حذف package-lock.json القديم قبل كل build
echo "🗑️ Deleting old package-lock.json..."
rm -f package-lock.json
echo "✅ Clean build ready"
