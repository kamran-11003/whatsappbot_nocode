"""Sandboxed code node using RestrictedPython."""
from RestrictedPython import compile_restricted, safe_globals
from RestrictedPython.Eval import default_guarded_getitem, default_guarded_getiter
from RestrictedPython.Guards import (
    safe_builtins,
    guarded_iter_unpack_sequence,
    full_write_guard,
)


async def code(node, ctx, creds, persist):
    data = node.get("data", {}) or {}
    src = data.get("code", "")
    if not src.strip():
        return {"next_handle": "out"}

    try:
        byte_code = compile_restricted(src, filename="<code-node>", mode="exec")
        local_vars = dict(ctx.variables)
        glb = dict(safe_globals)
        glb["__builtins__"] = {**safe_builtins, "len": len, "range": range, "min": min,
                               "max": max, "sum": sum, "abs": abs, "sorted": sorted,
                               "enumerate": enumerate, "zip": zip, "list": list,
                               "dict": dict, "set": set, "tuple": tuple, "str": str,
                               "int": int, "float": float, "bool": bool, "round": round}
        glb["_getitem_"] = default_guarded_getitem
        glb["_getiter_"] = default_guarded_getiter
        glb["_iter_unpack_sequence_"] = guarded_iter_unpack_sequence
        # Required for `vars["x"] = ...` style assignment.
        glb["_write_"] = full_write_guard
        glb["_getattr_"] = getattr
        glb["vars"] = local_vars
        exec(byte_code, glb, local_vars)
        # merge changes back, dropping private/keys
        for k, v in local_vars.items():
            if not k.startswith("_"):
                ctx.variables[k] = v
    except Exception as e:
        ctx.variables["_code_error"] = str(e)

    return {"next_handle": "out"}
