import { Request, Response } from "express";
import { returnError } from "@/helpers/return_calls/error_return";
import { ErrorType } from "@/helpers/return_calls/error_types";
import { stringify } from "csv-stringify/sync";
import { getSubmissionsForCsvExport } from "@/database/organizer";

export const exportSubmissionsCsv = async (req: Request, res: Response) => {
    try {
        const submissions = await getSubmissionsForCsvExport({
            userId: req.userId,
            hackathonId: req.hackathonId,
        });

        const formattedSubmissions = submissions.map((submission) => ({
            id: submission.id,
            title: submission.title,
            description: submission.description,
            teamId: submission.teamId,
            teamName: submission.team.name,
            submissionStatus: submission.submissionStatus,
            links: submission.links
                .map((link) => `${link.name}: ${link.link}: ${link.status}`)
                .join(" | "),
            updatedAt: submission.updatedAt.toISOString(),
        }));

        const csvContent = stringify(formattedSubmissions, {
            header: true,
            columns: [
                { key: "id", header: "Submission ID" },
                { key: "title", header: "Project Title" },
                { key: "description", header: "Description" },
                { key: "teamId", header: "Team ID" },
                { key: "teamName", header: "Team Name" },
                { key: "submissionStatus", header: "Status" },
                { key: "links", header: "Project Links" },
                { key: "updatedAt", header: "Last Updated" },
            ],
        });

        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="submissions-${req.hackathonId}.csv"`,
        );

        return res.status(200).send(csvContent);
    } catch (error) {
        console.error(error);
        return returnError(ErrorType.InternalServerError, res);
    }
};
