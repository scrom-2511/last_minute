export enum ErrorType {
    InvalidRequest,
    InternalServerError,
    Unauthorized,
    FileNotFound,
}

export class ErrorTypeUtils {
    static getMessage(error: ErrorType): string {
        switch (error) {
            case ErrorType.InvalidRequest:
                return "Invalid request";
            case ErrorType.InternalServerError:
                return "Internal server error";
            case ErrorType.Unauthorized:
                return "Unauthorized";
            case ErrorType.FileNotFound:
                return "File not found";
        }
    }

    static getStatusCode(error: ErrorType): number {
        switch (error) {
            case ErrorType.InvalidRequest:
                return 400;
            case ErrorType.InternalServerError:
                return 500;
            case ErrorType.Unauthorized:
                return 401;
            case ErrorType.FileNotFound:
                return 404;
        }
    }
}