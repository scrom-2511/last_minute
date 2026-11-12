export enum BusinessErrorType {
    HackathonDeadlineExceeded,
}

export enum ErrorType {
    InvalidRequest,
    InternalServerError,
    Unauthorized,
    FileNotFound,
    ResourceNotFound,
}

export type AppErrorType = ErrorType | BusinessErrorType;

export class ErrorTypeUtils {
    static getMessage(error: AppErrorType): string {
        switch (error) {
            case BusinessErrorType.HackathonDeadlineExceeded:
                return "Hackathon deadline exceeded";

            case ErrorType.InvalidRequest:
                return "Invalid request";

            case ErrorType.InternalServerError:
                return "Internal server error";

            case ErrorType.Unauthorized:
                return "Unauthorized";

            case ErrorType.FileNotFound:
                return "File not found";

            case ErrorType.ResourceNotFound:
                return "Resource not found";
        }
    }

    static getStatusCode(error: AppErrorType): number {
        switch (error) {
            case BusinessErrorType.HackathonDeadlineExceeded:
            case ErrorType.InvalidRequest:
                return 400;

            case ErrorType.InternalServerError:
                return 500;

            case ErrorType.Unauthorized:
                return 401;

            case ErrorType.FileNotFound:
            case ErrorType.ResourceNotFound:
                return 404;
        }
    }
}