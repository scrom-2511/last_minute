import { Request, Response } from "express";
import { z } from "zod";
import { returnError } from "../../../helpers/return_calls/error_return.js";
import { ErrorType } from "../../../helpers/return_calls/error_types.js";

const querySchema = z.object({
    hackathonId: z.string().min(1),
});

// Streams all submissions formatted as a CSV export for organizers
export const exportSubmissionsCsv = async (req: Request, res: Response) => {
    try {
        const parsed = querySchema.safeParse(req.query);
        if (!parsed.success) return returnError(ErrorType.InvalidRequest, res);

        const { hackathonId } = parsed.data;

        // TODO: implement getSubmissionsForCsvExport in database
        const submissions = await getSubmissionsForCsvExport();

        // Build CSV format: escape strings containing commas or quotes
        const headers = [
            "Project ID",
            "Team ID",
            "Project Name",
            "Status",
            "Version",
            "Submitted At",
            "Checks Passed",
            "Fix Needed",
        ];

        const escapeCsvField = (field: unknown): string => {
            const str = String(field ?? "");
            return str.includes(",") || str.includes('"') || str.includes("\n")
                ? `"${str.replace(/"/g, '""')}"`
                : str;
        };

        const rows = submissions.map((sub) =>
            [
                sub.projectId,
                sub.teamId,
                escapeCsvField(sub.projectName),
                sub.status,
                sub.version,
                new Date(sub.submittedAt * 1000).toISOString(),
                sub.checksPassed ? "YES" : "NO",
                escapeCsvField(sub.fixNeeded ?? ""),
            ].join(","),
        );

        const csvContent = [headers.join(","), ...rows].join("\n");

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="submissions-${hackathonId}.csv"`,
        );

        return res.status(200).send(csvContent);
    } catch (error) {
        console.error(error);
        return returnError(ErrorType.InternalServerError, res);
    }
};
