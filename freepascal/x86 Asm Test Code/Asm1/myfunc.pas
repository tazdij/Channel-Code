Unit myfunc;
interface
(*pass n1 Add 10 assign to n2 *)
Procedure PassN(n1 : integer; var n2 : integer);

(* pass n1 and n2 and 10 to both *)
Procedure ChangeN(var n1,n2 : integer); 

(* pass n1 add 10 and return value to function result *)
Function ReturnN(n1: integer) : integer;

implementation
Procedure PassN(n1 : integer; var n2 : integer); external;
Procedure ChangeN(var n1,n2 : integer); external;
Function ReturnN(n1: integer) : integer; external;
{$L myfunc.obj}

begin
end.