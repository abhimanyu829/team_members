import ast
import re

# Try to compile and see all errors
with open('server.py', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find ALL lines that have "file_record" and unusual indentation
print("=== Scanning for broken file_record blocks ===")
for i, line in enumerate(lines):
    if 'file_record["status"] = "pending"' in line or "file_record['status'] = 'pending'" in line:
        # Show this line and the next 4
        print(f"\n--- Block at line {i+1} ---")
        for j in range(i, min(i+5, len(lines))):
            indent = len(lines[j]) - len(lines[j].lstrip())
            print(f"  L{j+1} (indent={indent}): {repr(lines[j])}")

# Now fix: any block where status= is at indent 4, but subsequent lines are at indent 8
print("\n=== Fixing... ===")
fixed_lines = list(lines)
i = 0
changes = 0
while i < len(fixed_lines):
    line = fixed_lines[i]
    stripped = line.lstrip()
    current_indent = len(line) - len(stripped)
    
    if 'file_record["status"] = "pending"' in stripped or "file_record['status'] = 'pending'" in stripped:
        # The next 3 lines should match this indent
        for j in range(1, 4):
            if i + j < len(fixed_lines):
                next_line = fixed_lines[i + j]
                next_stripped = next_line.lstrip()
                next_indent = len(next_line) - len(next_stripped)
                if next_indent > current_indent and next_stripped and not next_stripped.startswith('#'):
                    fixed_lines[i + j] = ' ' * current_indent + next_stripped
                    changes += 1
                    print(f"  Fixed L{i+j+1}: indent {next_indent} -> {current_indent}")
                else:
                    break  # Indent is correct, stop
    i += 1

print(f"\nTotal fixes: {changes}")
with open('server.py', 'w', encoding='utf-8') as f:
    f.writelines(fixed_lines)
print("Written to server.py")

# Verify
import subprocess
result = subprocess.run(['python', '-m', 'py_compile', 'server.py'], capture_output=True, text=True)
if result.returncode == 0:
    print("\n✅ Syntax OK!")
else:
    print(f"\n❌ Still has error: {result.stderr}")
