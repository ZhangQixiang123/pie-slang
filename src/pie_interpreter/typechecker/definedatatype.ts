import * as S from '../types/source';
import * as C from '../types/core';
import * as V from '../types/value';
import { go, Perhaps, stop, fresh, TypedBinder, Message, SiteBinder, HigherOrderClosure } from '../types/utils';
import { Context, extendContext, InductiveDatatypeBinder, ConstructorTypeBinder, contextToEnvironment, EliminatorBinder, valInContext, bindFree, getClaim } from '../utils/context';
import { Location, Syntax } from '../utils/locations';
import { extendRenaming, Renaming } from './utils';
import { Environment } from '../utils/environment';
import { VarName } from '../types/core';
import { synthesizer } from './synthesizer';
import { doApp } from '../evaluator/evaluator';
import { Position } from '../../scheme_parser/transpiler/types/location';

function isRecursiveArgumentType(argType: S.Source, datatypeName: string): boolean {
  if (argType instanceof S.Name && argType.name === datatypeName) {
    return true;
  }

  if (argType instanceof S.GeneralTypeConstructor &&
      argType.name === datatypeName) {
    return true;
  }

  return false;
}

export class DefineDatatypeSource {
  constructor(
    public location: Location,
    public name: string,
    public parameters: TypedBinder[],
    public indices: TypedBinder[],
    public constructors: GeneralConstructor[],
    public eliminatorName?: string
  ) { }

  normalize_constructor(ctx: Context, rename: Renaming) {
      const validTypeTemp = (new S.GeneralType
      (this.location,
        this.name,
        this.parameters,
        this.indices
      ).isType(ctx, rename)
    )
    if (validTypeTemp instanceof stop) {
      throw new Error(validTypeTemp.message.toString())
    }
    const validType = (validTypeTemp as go<C.Core>).result

    let extendedCtx = ctx;
    let extendedRename = rename;
    for (const param of this.parameters) {
      const paramName = param.binder.varName;
      const paramTypeResult = param.type.isType(extendedCtx, extendedRename);
      if (paramTypeResult instanceof stop) {
        throw new Error(paramTypeResult.message.toString());
      }
      const paramTypeCore = (paramTypeResult as go<C.Core>).result;
      const paramNameHat = fresh(extendedCtx, paramName);
      extendedCtx = bindFree(extendedCtx, paramNameHat, valInContext(extendedCtx, paramTypeCore));
      extendedRename = extendRenaming(extendedRename, paramName, paramNameHat);
    }

    const validValueType = valInContext(extendedCtx, validType);

    // Add the inductive type itself to the context so recursive constructors can reference it
    extendedCtx = extendContext(extendedCtx, this.name,
      new InductiveDatatypeBinder(this.name, validValueType as V.InductiveType))

    let normalized_constructor: C.ConstructorType[] = []
    for (let i = 0; i < this.constructors.length; i++) {
      // For types with no parameters, validValueType will be Universe, not Pi
      // We need to pass the appropriate target type to checkValid
      normalized_constructor.push(this.constructors[i].checkValid(extendedCtx, extendedRename, validValueType as any, i))
    }
    
    let ret_ctx = ctx
    let ret_rename = rename
    ret_ctx = extendContext(ret_ctx, this.name,
      new InductiveDatatypeBinder(this.name, validValueType as V.InductiveType))
    normalized_constructor.forEach(element => {
      const fresh_name = fresh(ret_ctx, element.name)
      // Get the InductiveTypeConstructor from the constructor's result type
      // For parameterized types, this will contain VarNames - that's OK, it's symbolic
      let resultTypeValue: V.InductiveTypeConstructor

      if (element.numTypeParams > 0) {
        // For parameterized constructors, evaluate in the extended context where parameters were bound
        resultTypeValue = valInContext(extendedCtx, element.resultType) as V.InductiveTypeConstructor
      } else {
        // For simple constructors, evaluate in base context
        resultTypeValue = valInContext(ctx, element.resultType) as V.InductiveTypeConstructor
      }

      ret_ctx = extendContext(ret_ctx, fresh_name, new ConstructorTypeBinder(fresh_name, element, resultTypeValue))
      ret_rename = extendRenaming(ret_rename, element.name, fresh_name)
    })
    return [ret_ctx, ret_rename] as [Context, Renaming]
  }
}



export class GeneralConstructor {
  constructor(
    public location: Location,
    public name: string,
    public args: TypedBinder[],
    public returnType: S.GeneralTypeConstructor
  ) { }

  checkValid(ctx: Context, rename: Renaming, target: V.Value, index: number) {
    let cur_ctx = ctx
    let cur_rename = rename
    let normalized_args = []
    let normalized_rec_args = []

    // Determine numTypeParams from the target type
    // For parameterized types, target is an InductiveType with parameterTypes
    let numTypeParams = 0;
    if (target instanceof V.InductiveType) {
      numTypeParams = target.parameterTypes.length;
    }

    let argNames: string[] = []

    // For parameterized types, we need to figure out the fresh names used for parameters
    // The return type contains applications of the parameters, we can extract names from there
    // The parameters were bound in the context before this constructor was checked
    // They appear in the returnType of the constructor
    // Strategy: extract parameter variable names from the returnType's params
    const paramVarNames: string[] = [];
    if (this.returnType instanceof S.GeneralTypeConstructor && this.returnType.params.length > 0) {
      // Extract variable names from the return type's params
      for (const param of this.returnType.params) {
        if (param instanceof S.Name) {
          // This is a reference to a type parameter
          const freshName = rename.get(param.name);
          if (freshName) {
            paramVarNames.push(freshName);
          }
        }
      }
    }
    argNames = [...paramVarNames];

    for (let i = 0; i < this.args.length; i++) {
      const argName = this.args[i].binder.varName
      const xhat = fresh(cur_ctx, argName)

      // Store the constructor argument name
      argNames.push(argName)

      // Get the Core representation of the type annotation
      const resultTemp = this.args[i].type.isType(cur_ctx, cur_rename)
      if (resultTemp instanceof stop) {
        throw new Error(resultTemp.message.toString())
      }
      const result = (resultTemp as go<C.Core>).result

      if (isRecursiveArgumentType(this.args[i].type,this.returnType.name)) {
        normalized_rec_args.push(result)
      } else {
        normalized_args.push(result)
      }

      cur_ctx = bindFree(cur_ctx, xhat, valInContext(cur_ctx, result))
      cur_rename = extendRenaming(cur_rename, argName, xhat)
    }

    const returnTemp = this.returnType.check(cur_ctx, cur_rename, target)
    if (returnTemp instanceof stop) {
      throw new Error(returnTemp.message.toString())
    }
    const returnResult = (returnTemp as go<C.Core>).result
    return new C.ConstructorType(
        this.name,
        index,
        this.returnType.name,
        normalized_args,
        normalized_rec_args,
        returnResult,
        numTypeParams,
        argNames
      )


  }
}

export class GeneralTypeSource {
  constructor(
    public location: Location,
    public name: string,
    public parameters: TypedBinder[],
    public indices: TypedBinder[]
  ){ }
}

// Helper function to create constructor spec
export function makeConstructorSpec(name: string, args: TypedBinder[]): GeneralConstructor {
  return new GeneralConstructor(
    args.length > 0 ? args[0].binder.location : new Location(new Syntax(new Position(0, 0), new Position(0, 0), 'generated'), false),
    name,
    args,
    new S.GeneralTypeConstructor(
      args.length > 0 ? args[0].binder.location : new Location(new Syntax(new Position(0, 0), new Position(0, 0), 'generated'), false),
      '',  // Will be set by caller
      [],
      []
    )
  );
}

// Main function to handle datatype definition and add to context
export function handleDefineDatatype(ctx: Context, rename: Renaming, target: DefineDatatypeSource): Perhaps<Context> {
  if (ctx.has(target.name)) {
    return new stop(target.location, new Message([`Name already in use: ${target.name}`]));
  }
  let [new_ctx, new_rename] = target.normalize_constructor(ctx, rename)

  
}

