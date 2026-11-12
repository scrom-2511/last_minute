export enum ErrorType {
    Invalid_Request,
    Internal_Server_Error,
    Unauthorized,
    File_Not_Found,
}

export class ErrorTypeUtils {
    static getMessage(error: ErrorType): string {
        switch (error) {
            case ErrorType.Invalid_Request:
                return "Invalid request";
            case ErrorType.Internal_Server_Error:
                return "Internal server error";
            case ErrorType.Unauthorized:
                return "Unauthorized";
            case ErrorType.File_Not_Found:
                return "File not found";
        }
    }

    static getStatusCode(error: ErrorType): number {
        switch (error) {
            case ErrorType.Invalid_Request:
                return 400;
            case ErrorType.Internal_Server_Error:
                return 500;
            case ErrorType.Unauthorized:
                return 401;
            case ErrorType.File_Not_Found:
                return 404;
        }
    }
}